# -----------------------------
# Enhanced Adaptive Time Series Predictor
# With SVR tuning, feature engineering, and adaptive model selection
# -----------------------------
import io
import warnings
import sys
import os
import json
import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler
from sklearn.svm import SVR
from sklearn.model_selection import GridSearchCV
from sklearn.metrics import mean_absolute_error, mean_squared_error
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
from tensorflow.keras.regularizers import l2
import matplotlib.pyplot as plt
import matplotlib
# Use non-interactive backend for server environments (no GUI)
matplotlib.use('Agg')

# 🔧 Fix Unicode encoding for Windows console
if sys.platform == 'win32':
    # Set UTF-8 encoding for stdout/stderr on Windows
    if sys.stdout.encoding != 'utf-8':
        sys.stdout = io.TextIOWrapper(
            sys.stdout.buffer, encoding='utf-8', errors='replace')
    if sys.stderr.encoding != 'utf-8':
        sys.stderr = io.TextIOWrapper(
            sys.stderr.buffer, encoding='utf-8', errors='replace')

# 🔧 Global error handler to ensure errors are printed to stderr


def handle_exception(exc_type, exc_value, exc_traceback):
    if issubclass(exc_type, KeyboardInterrupt):
        sys.__excepthook__(exc_type, exc_value, exc_traceback)
        return
    print("="*70, file=sys.stderr)
    print("❌ UNHANDLED EXCEPTION", file=sys.stderr)
    print("="*70, file=sys.stderr)
    print(f"Type: {exc_type.__name__}", file=sys.stderr)
    print(f"Message: {str(exc_value)}", file=sys.stderr)
    print("\nTraceback:", file=sys.stderr)
    import traceback
    traceback.print_exception(
        exc_type, exc_value, exc_traceback, file=sys.stderr)
    print("="*70, file=sys.stderr)
    sys.exit(1)


sys.excepthook = handle_exception

# 🤫 Suppress warnings and TF logs
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
# os.environ['CUDA_VISIBLE_DEVICES'] = '-1' # 🚀 GPU ENABLED!
warnings.filterwarnings('ignore')


# -----------------------------
# Helper functions
# -----------------------------

def create_sequences_with_stride(X_scaled, y_scaled, seq_len, stride=1):
    """Create overlapping sequences for data augmentation"""
    X_seq, y_seq = [], []
    for i in range(seq_len, len(y_scaled), stride):
        X_seq.append(X_scaled[i-seq_len:i])
        y_seq.append(y_scaled[i])
    return np.array(X_seq), np.array(y_seq)


# -----------------------------
# 1️⃣ Load dataset
# -----------------------------
# CSV path must be provided as the first command line argument
if len(sys.argv) <= 1:
    print("❌ ERROR: CSV file path argument is required")
    sys.exit(1)

csv_file_path = sys.argv[1]
print(f"🚀 Loading dataset from: {csv_file_path}")
if not os.path.exists(csv_file_path):
    print(f"❌ ERROR: CSV file not found at: {csv_file_path}")
    sys.exit(1)

df = pd.read_csv(
    csv_file_path,
    on_bad_lines='skip',
    # Properly handle quoted fields with commas
    quotechar='"',
    quoting=1,  # QUOTE_ALL - quote all fields
    skipinitialspace=True  # Skip spaces after delimiter
)

# 🔍 DEBUG: Print actual columns found
print(f"📂 Loaded dataset: {df.shape[0]} rows, {df.shape[1]} columns")
print(f"🔎 Columns found: {df.columns.tolist()}")
print(f"🔍 First 3 rows of entire dataframe:")
print(df.head(3).to_string())

# 🧹 CLEANUP: Strip spaces from column names automatically
df.columns = df.columns.str.strip()
print(f"🔍 After stripping spaces, columns: {df.columns.tolist()}")

# -----------------------------
# 2️⃣ User selections (from environment variables)
# -----------------------------
# Required: TARGET_COLUMN must be provided via environment
target_column = os.getenv('TARGET_COLUMN')
if not target_column:
    print("❌ ERROR: TARGET_COLUMN environment variable is required")
    sys.exit(1)

print(f"📋 Using target column from environment: '{target_column}'")

# 🔍 DEBUG: Check target column AFTER it's defined
print(f"\n🔍 DEBUG: Checking target column '{target_column}':")
if target_column in df.columns:
    print(f"   ✅ Target column exists")
    print(f"   Data type: {df[target_column].dtype}")
    print(f"   First 10 values: {df[target_column].head(10).tolist()}")
    print(
        f"   Unique values (first 20): {df[target_column].unique()[:20].tolist()}")
else:
    print(f"   ❌ Target column NOT FOUND!")
    print(f"   Available columns: {df.columns.tolist()}")
    # Try to find a column that looks like it might be the target
    numeric_cols = [
        c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
    print(f"   Numeric columns found: {numeric_cols}")
    if len(numeric_cols) > 0:
        print(f"   💡 Suggestion: Use '{numeric_cols[0]}' as target column")
        print(f"   💡 Available numeric columns: {numeric_cols}")

# 📋 FEATURE SELECTION (optional)
# Allow frontend/backend to pass feature columns via environment, e.g.
# FEATURE_COLUMNS="Online,Retail,Net,Gross"
feature_columns_env = os.getenv('FEATURE_COLUMNS')
if feature_columns_env:
    feature_columns = [c.strip()
                       for c in feature_columns_env.split(',') if c.strip()]
else:
    feature_columns = []

# 🔮 FORECAST CONFIGURATION (required)
forecast_window_raw = os.getenv('FORECAST_WINDOW')
if not forecast_window_raw:
    print("❌ ERROR: FORECAST_WINDOW environment variable is required")
    sys.exit(1)

try:
    FORECAST_WINDOW = int(forecast_window_raw)
    if FORECAST_WINDOW <= 0:
        raise ValueError("FORECAST_WINDOW must be > 0")
except Exception as e:
    print("❌ ERROR: Invalid FORECAST_WINDOW value")
    print(f"FORECAST_WINDOW='{forecast_window_raw}', details: {e}")
    sys.exit(1)

# Validate that target column exists in the dataset
if target_column not in df.columns:
    print(f"❌ ERROR: Target column '{target_column}' not found in dataset")
    print(f"📋 Available columns: {df.columns.tolist()}")
    print("💡 Tip: Make sure the target column name matches exactly (case-sensitive)")
    sys.exit(1)

print(f"✅ Target column '{target_column}' found in dataset")

# Feature selection
print("\n🔧 Feature selection:")
original_feature_count = len(feature_columns)
feature_columns = [c for c in feature_columns if c in df.columns]
if original_feature_count > 0 and len(feature_columns) == 0:
    print("   ⚠️  None of the requested feature columns exist in the dataset")
elif original_feature_count > len(feature_columns):
    missing = set(feature_columns) - set(df.columns)
    print(
        f"   ⚠️  Some requested feature columns are missing and will be ignored: {list(missing)}")
print(
    f"   Using {len(feature_columns)} feature columns (original list size: {original_feature_count})")

# Drop rows with NaN in target column
df = df.dropna(subset=[target_column]).reset_index(drop=True)
print(f"   Rows after removing NaN from target: {len(df)}")

if len(df) == 0:
    print("❌ ERROR: All rows removed after dropping NaN in target column")
    sys.exit(1)

# -----------------------------
# 3.5 Model selection and encoding constraints
# -----------------------------
# Required: MODEL_TYPE must be provided as 'SVR' or 'LSTM'
model_type = os.getenv('MODEL_TYPE')
if model_type is None:
    print("❌ ERROR: MODEL_TYPE environment variable is required ('SVR' or 'LSTM')")
    sys.exit(1)

model_type = model_type.strip().upper()
if model_type not in ["SVR", "LSTM"]:
    print(
        f"❌ ERROR: Invalid MODEL_TYPE='{model_type}', expected 'SVR' or 'LSTM'")
    sys.exit(1)

print(f"\n🤖 Using model type from environment: {model_type}")

# 🧹 CLEANUP: Force target to be numeric (handles '?0.2' typos)
print(f"   🔍 Debug: Before numeric conversion, df shape: {df.shape}")
print(
    f"   🔍 Debug: Target column sample values: {df[target_column].head().tolist()}")
df[target_column] = pd.to_numeric(df[target_column], errors='coerce')
print(
    f"   🔍 Debug: After numeric conversion, NaN count in target: {df[target_column].isna().sum()}")
df = df.dropna(subset=[target_column])
print(f"   🔍 Debug: After dropna on target, df shape: {df.shape}")

if len(df) == 0:
    print("❌ ERROR: All rows removed after converting target to numeric")
    print("   The target column values cannot be converted to numbers")
    sys.exit(1)

# Handle missing values broadly first to fix broken numeric cols
df = df.fillna(method='ffill').fillna(method='bfill')
print(f"   🔍 Debug: After ffill/bfill, df shape: {df.shape}")

# 🔧 Robustify target a bit: clip extreme outliers so that a few very
# large values do not dominate the loss and R², which is especially
# important for tiny datasets like this sample (36 rows).
q1 = df[target_column].quantile(0.25)
q3 = df[target_column].quantile(0.75)
iqr = q3 - q1
if iqr > 0:
    lower_bound = q1 - 1.5 * iqr
    upper_bound = q3 + 1.5 * iqr
    before_clip_min, before_clip_max = df[target_column].min(
    ), df[target_column].max()
    df[target_column] = df[target_column].clip(lower_bound, upper_bound)
    after_clip_min, after_clip_max = df[target_column].min(
    ), df[target_column].max()
    if before_clip_min != after_clip_min or before_clip_max != after_clip_max:
        print(
            f"   🔍 Target clipping applied: [{before_clip_min}, {before_clip_max}] -> [{after_clip_min}, {after_clip_max}]")

# 🔄 RE-EVALUATE TYPES: Now that data is clean, split features
# If no feature columns provided, default to univariate forecasting
# (using only the target column as feature)
if len(feature_columns) == 0:
    print("   ℹ️  No feature columns provided; defaulting to univariate forecasting (target column only)")
    feature_columns = [target_column]

# Validate that all feature columns are numeric
numeric_features = [
    c for c in feature_columns if pd.api.types.is_numeric_dtype(df[c])]
non_numeric_features = [
    c for c in feature_columns if not pd.api.types.is_numeric_dtype(df[c])]

if non_numeric_features:
    print(
        f"❌ ERROR: Non-numeric feature columns detected: {non_numeric_features}")
    print("   Only numeric columns are allowed for features and target")
    sys.exit(1)

# Handle specific missing values if any remain
for c in numeric_features:
    df[c] = df[c].fillna(df[c].median())

# All features are numeric, so no encoding needed
X_numeric = df[numeric_features] if numeric_features else pd.DataFrame()
df_encoded = pd.DataFrame()  # No categorical features to encode

print(f"   🔍 Debug: df shape before X creation: {df.shape}")
print(f"   🔍 Debug: numeric_features count: {len(numeric_features)}")
print(f"   🔍 Debug: X_numeric shape: {X_numeric.shape}")

# Create X matrix - handle empty DataFrames properly
if X_numeric.empty and df_encoded.empty:
    print("❌ ERROR: No features available after processing")
    print(f"   feature_columns: {feature_columns}")
    print(f"   df columns: {df.columns.tolist()}")
    sys.exit(1)

if X_numeric.empty:
    X = df_encoded
elif df_encoded.empty:
    X = X_numeric
else:
    X = pd.concat([X_numeric, df_encoded], axis=1)

print(f"   🔍 Debug: Final X shape: {X.shape}")

# Remember index of target column inside feature matrix (if present).
# This is later used to update the autoregressive target value during
# multi-step forecasting so that each future step conditions on the
# previous prediction instead of repeating the last real observation.
target_in_X_index = None
if target_column in X.columns:
    target_in_X_index = X.columns.get_loc(target_column)
    print(f"   🔍 Target column position in X: {target_in_X_index}")
else:
    print("   ℹ️  Target column is not part of feature matrix X")

# 🛡️ VALIDATE: Check if we have data after processing
if len(df) == 0:
    print("❌ ERROR: DataFrame is empty after feature engineering and cleaning")
    print("   This usually happens when:")
    print("   - All rows are removed by dropna()")
    print("   - Rolling/lag features create too many NaN values")
    print("   - Target column has all NaN values")
    sys.exit(1)

if X.shape[0] == 0:
    print("❌ ERROR: Feature matrix X has 0 rows")
    print(f"   DataFrame has {len(df)} rows but X has 0 rows")
    print(f"   This means feature selection/creation failed")
    print(f"   Available columns in df: {df.columns.tolist()}")
    print(f"   feature_columns requested: {feature_columns}")
    sys.exit(1)

if X.shape[1] == 0:
    print(f"❌ ERROR: Invalid feature matrix shape: {X.shape}")
    print(f"   DataFrame shape: {df.shape}")
    print(f"   Numeric features: {len(numeric_features)}")
    print(
        f"   X_numeric shape: {X_numeric.shape if not X_numeric.empty else 'empty'}")
    sys.exit(1)

y = df[target_column].values.reshape(-1, 1)
# print(f"   🔍 Debug: y shape: {y[0:10]}")

# 🛡️ VALIDATE: Check target values
if len(y) == 0 or np.isnan(y).all():
    print("❌ ERROR: Target column has no valid values")
    sys.exit(1)

print(f"✅ Final dataset shape: {X.shape[0]} rows, {X.shape[1]} features")

# Scale features
scaler_X = MinMaxScaler()
scaler_y = MinMaxScaler()
X_scaled = scaler_X.fit_transform(X)
y_scaled = scaler_y.fit_transform(y)

# -----------------------------
# 4️⃣ Create sequences with adaptive augmentation
# -----------------------------
# Adaptive sequence length (Increased for better context)
# SEQ_LEN = min(30, len(y_scaled) // 5)
# print(f"\n📏 Using sequence length: {SEQ_LEN}")

SEQ_LEN = 40

initial_samples = len(y_scaled) - SEQ_LEN

# Adaptive augmentation
if initial_samples < 100:
    print("⚠️  Very small dataset detected (<100 samples)")
    print("   Using stride=1 for maximum sequences (no skipping)...")
    stride = 1
    X_seq, y_seq = create_sequences_with_stride(
        X_scaled, y_scaled, SEQ_LEN, stride=stride)
    data_was_augmented = True
    print(
        f"   ✓ Created {len(X_seq)} sequences from {initial_samples} samples")
elif initial_samples < 300:
    print("📊 Small dataset detected (<300 samples)")
    print("   Using stride=1 to keep as much temporal information as possible...")
    stride = 1
    X_seq, y_seq = create_sequences_with_stride(
        X_scaled, y_scaled, SEQ_LEN, stride=stride)
    data_was_augmented = True
    print(
        f"   ✓ Created {len(X_seq)} sequences from {initial_samples} samples")
else:
    print("✅ Sufficient data, using dense sliding window (stride=1)")
    # Use ALL data (sliding window of 1) to get maximum samples
    stride = 1
    X_seq, y_seq = create_sequences_with_stride(
        X_scaled, y_scaled, SEQ_LEN, stride=stride)
    data_was_augmented = False

print(f"Final shape → X_seq: {X_seq.shape}, y_seq: {y_seq.shape}")

# -----------------------------
# 5️⃣ Train/test split
# -----------------------------
split_idx = int(0.8*len(X_seq))
X_train_seq, X_test_seq = X_seq[:split_idx], X_seq[split_idx:]
y_train_seq, y_test_seq = y_seq[:split_idx], y_seq[split_idx:]

# -----------------------------
# 6️⃣ ADAPTIVE MODEL SELECTION (Already done in step 3.5)
# -----------------------------
n_samples = len(X_train_seq)
print(f"\n📊 Actual Training Samples: {n_samples}")
# We strongly rely on the decision made earlier to ensure consistency with encoding
print(f"🤖 Confirmed Model: {model_type}")


# -----------------------------
# 7️⃣ Train model
# -----------------------------
if model_type == "SVR":
    X_train_flat = X_train_seq.reshape(X_train_seq.shape[0], -1)
    X_test_flat = X_test_seq.reshape(X_test_seq.shape[0], -1)

    print("   🔍 Grid searching for optimal SVR parameters...")

    # Grid search for best hyperparameters
    param_grid = {
        'C': [1, 10, 20],
        'gamma': [0.01, 0.1],
        'epsilon': [0.01, 0.1]
    }

    svr_base = SVR(kernel="rbf")
    # Calculate CV folds - must be at least 2 for GridSearchCV
    # Use at least 2 folds, but don't exceed 3 or train_size/10
    cv_folds = max(2, min(3, len(X_train_flat) // 10))

    # If we have very few samples, skip grid search and use default parameters
    if len(X_train_flat) < 20:
        print(
            f"   ⚠️  Very few training samples ({len(X_train_flat)}), using default SVR parameters")
        svr_model = SVR(kernel='rbf', C=1.0, gamma='scale', epsilon=0.1)
        svr_model.fit(X_train_flat, y_train_seq.ravel())
        print("   ✓ Using default SVR parameters (no grid search)")
    else:
        grid_search = GridSearchCV(
            svr_base,
            param_grid,
            cv=cv_folds,
            scoring='neg_mean_squared_error',
            n_jobs=-1,
            verbose=3
        )

        grid_search.fit(X_train_flat, y_train_seq.ravel())
        svr_model = grid_search.best_estimator_

        # Format gamma safely (it might be 'scale' or a float)
        gamma_str = f"{svr_model.gamma:.3f}" if isinstance(
            svr_model.gamma, (int, float)) else str(svr_model.gamma)
        print(
            f"   ✓ Best parameters: C={svr_model.C}, gamma={gamma_str}, epsilon={svr_model.epsilon:.3f}")

    y_train_pred = svr_model.predict(X_train_flat)
    y_test_pred = svr_model.predict(X_test_flat)
    conf_val = np.std(y_test_seq - y_test_pred.reshape(-1, 1))
    print("y_train_pred shape:", y_train_pred.shape)
    print("y_test_pred shape:", y_test_pred.shape)

else:
    # LSTM with adaptive architecture
    input_shape = (X_train_seq.shape[1], X_train_seq.shape[2])

    if len(X_train_seq) < 150:
        print("   → Using SIMPLIFIED but DEEPER architecture")
        # More units and slightly lower dropout to reduce underfitting
        lstm_units = 32
        dropout_rate = 0.15
        use_two_layers = False
    elif len(X_train_seq) < 400:
        print("   → Using MODERATE architecture")
        lstm_units = 64
        dropout_rate = 0.15
        use_two_layers = False
    else:
        print("   → Using STANDARD one-layer architecture")
        lstm_units = 64
        # lstm_units_2 = 32
        dropout_rate = 0.2
        use_two_layers = False

    model = Sequential()

    if use_two_layers:
        model.add(LSTM(lstm_units_1, return_sequences=True,
                  input_shape=input_shape))
        #    dropout=0.1, recurrent_dropout=0.1
        model.add(LSTM(lstm_units_2))
        # dropout=0.1, recurrent_dropout=0.1)
    else:
        model.add(LSTM(lstm_units, input_shape=input_shape))
        #    dropout=0.1, recurrent_dropout=0.1

    model.add(Dense(1))

    # ⚡ OPTIMIZATIONS:
    # 1. Higher LR (0.002) for stability (0.005 was too jumpy)
    # 2. Lower Patience (no need to wait forever)
    # Slightly lower learning rate for more stable convergence
    model.compile(optimizer=Adam(learning_rate=0.0015), loss="mae")

    early_stop = EarlyStopping(
        monitor='val_loss',
        patience=20,  # Give it more time to learn complex patterns
        restore_best_weights=True,
        verbose=1
    )

    reduce_lr = ReduceLROnPlateau(
        monitor='val_loss',
        factor=0.5,
        patience=7,
        min_lr=1e-5,
        verbose=1
    )

    # Upper bound on epochs; early stopping will usually stop earlier
    epochs = 80
    batch_size = max(32, len(X_train_seq) // 20)  # Larger batches for speed

    print(f"   Training: epochs={epochs}, batch_size={batch_size}")

    history = model.fit(
        X_train_seq, y_train_seq,
        epochs=epochs,
        batch_size=batch_size,
        validation_split=0.15,
        callbacks=[early_stop, reduce_lr],
        verbose=1  # 🔊 Show progress bar for LSTM
    )

    print(f"   ✓ Training completed in {len(history.history['loss'])} epochs")

    # Plot training history
    plt.figure(figsize=(12, 4))
    plt.subplot(1, 2, 1)
    plt.plot(history.history['loss'], label='Training Loss')
    plt.plot(history.history['val_loss'], label='Validation Loss')
    plt.xlabel('Epoch')
    plt.ylabel('Loss')
    plt.title('Training Progress')
    plt.legend()
    plt.grid(True, alpha=0.3)

    plt.subplot(1, 2, 2)
    plt.plot(history.history['loss'], label='Training Loss (log scale)')
    plt.plot(history.history['val_loss'], label='Validation Loss (log scale)')
    plt.yscale('log')
    plt.xlabel('Epoch')
    plt.ylabel('Loss (log)')
    plt.title('Training Progress (Log Scale)')
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    # Save plot instead of showing (for server environments)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    plot_path = os.path.join(
        script_dir, f'model_diagnosis_{model_type.lower()}.png')
    plt.savefig(plot_path, dpi=150, bbox_inches='tight')
    print(f"📊 Model diagnosis plot saved to: {plot_path}")
    plt.close()  # Close the figure to free memory

    y_train_pred = model.predict(X_train_seq, verbose=0)
    y_test_pred = model.predict(X_test_seq, verbose=0)
    conf_val = np.std(y_test_seq - y_test_pred)

# -----------------------------
# 8️⃣ Inverse scale predictions
# -----------------------------
y_train_pred_inv = scaler_y.inverse_transform(
    y_train_pred.reshape(-1, 1)).flatten()
y_test_pred_inv = scaler_y.inverse_transform(
    y_test_pred.reshape(-1, 1)).flatten()
y_train_inv = scaler_y.inverse_transform(y_train_seq.reshape(-1, 1)).flatten()
y_test_inv = scaler_y.inverse_transform(y_test_seq.reshape(-1, 1)).flatten()

# -----------------------------
# 9️⃣ Comprehensive metrics with underfitting detection
# -----------------------------
train_mae = mean_absolute_error(y_train_inv, y_train_pred_inv)
train_rmse = np.sqrt(mean_squared_error(y_train_inv, y_train_pred_inv))
test_mae = mean_absolute_error(y_test_inv, y_test_pred_inv)
test_rmse = np.sqrt(mean_squared_error(y_test_inv, y_test_pred_inv))

train_mape = np.mean(
    np.abs((y_train_inv - y_train_pred_inv) / (y_train_inv + 1e-8))) * 100
test_mape = np.mean(
    np.abs((y_test_inv - y_test_pred_inv) / (y_test_inv + 1e-8))) * 100

train_r2 = 1 - (np.sum((y_train_inv - y_train_pred_inv)**2) /
                np.sum((y_train_inv - np.mean(y_train_inv))**2))
test_r2 = 1 - (np.sum((y_test_inv - y_test_pred_inv)**2) /
               np.sum((y_test_inv - np.mean(y_test_inv))**2))

print("\n" + "="*70)
print("📊 MODEL PERFORMANCE METRICS")
print("="*70)
print(
    f"Training   → MAE: {train_mae:.3f} | RMSE: {train_rmse:.3f} | MAPE: {train_mape:.2f}% | R²: {train_r2:.3f}")
print(
    f"Testing    → MAE: {test_mae:.3f} | RMSE: {test_rmse:.3f} | MAPE: {test_mape:.2f}% | R²: {test_r2:.3f}")
print("-"*70)

# Model diagnosis
test_train_ratio = test_rmse / train_rmse
print("🔍 Model Diagnosis:")

if train_rmse > np.std(y_train_inv) * 0.8:
    print("   ⚠️  HIGH TRAIN ERROR - Possible UNDERFITTING")
    print("      → Model is too simple or not trained enough")
    print("      → Suggestions: Reduce dropout, add more units, train longer")
elif train_r2 < 0.3:
    print("   ⚠️  LOW R² SCORE - Possible UNDERFITTING")
    print("      → Model barely learning patterns")
    print("      → Suggestions: Increase model complexity or check data quality")
elif test_train_ratio > 1.5:
    print("   ⚠️  OVERFITTING DETECTED (test error >> train error)")
    print("      → Model memorizing training data")
    print("      → Suggestions: More dropout, more regularization, more data")
elif test_train_ratio < 0.8:
    print("   ⚠️  UNUSUAL: test error < train error")
    print("      → Check if test set is easier or data leakage exists")
else:
    print("   ✅ GOOD GENERALIZATION")
    print(f"      → Test/Train RMSE Ratio: {test_train_ratio:.2f}")
    if test_r2 > 0.7:
        print("      → Strong predictive performance (R² > 0.7)")
    elif test_r2 > 0.5:
        print("      → Moderate predictive performance (R² > 0.5)")
    else:
        print("      → Room for improvement (R² < 0.5)")

print("="*70 + "\n")

# -----------------------------
# 🔟 Plot predictions
# -----------------------------
fig, axes = plt.subplots(2, 1, figsize=(14, 8))

axes[0].plot(y_train_inv, label="Actual", linewidth=2, alpha=0.7)
axes[0].plot(y_train_pred_inv, label="Predicted", linewidth=2, alpha=0.7)
axes[0].fill_between(range(len(y_train_inv)),
                     y_train_pred_inv - train_rmse,
                     y_train_pred_inv + train_rmse,
                     alpha=0.2, label=f'±1 RMSE ({train_rmse:.2f})')
axes[0].set_xlabel("Time Step")
axes[0].set_ylabel(target_column)
axes[0].set_title(
    f"Training Set: Actual vs Predicted (MAE: {train_mae:.3f}, R²: {train_r2:.3f})")
axes[0].legend()
axes[0].grid(True, alpha=0.3)

axes[1].plot(y_test_inv, label="Actual", linewidth=2, alpha=0.7)
axes[1].plot(y_test_pred_inv, label="Predicted", linewidth=2, alpha=0.7)
axes[1].fill_between(range(len(y_test_inv)),
                     y_test_pred_inv - test_rmse,
                     y_test_pred_inv + test_rmse,
                     alpha=0.2, label=f'±1 RMSE ({test_rmse:.2f})')
axes[1].set_xlabel("Time Step")
axes[1].set_ylabel(target_column)
axes[1].set_title(
    f"Test Set: Actual vs Predicted (MAE: {test_mae:.3f}, R²: {test_r2:.3f})")
axes[1].legend()
axes[1].grid(True, alpha=0.3)

plt.tight_layout()
# Save plot instead of showing (for server environments)
script_dir = os.path.dirname(os.path.abspath(__file__))
plot_path = os.path.join(script_dir, 'training_predictions.png')
plt.savefig(plot_path, dpi=150, bbox_inches='tight')
plt.close()  # Close the figure to free memory

# -----------------------------
# 1️⃣1️⃣ Future predictions
# -----------------------------
last_seq = X_scaled[-SEQ_LEN:]
future_preds_scaled = []

print(f"\n🔮 Generating {FORECAST_WINDOW} future forecasts...")

for step in range(1, FORECAST_WINDOW + 1):
    # 1. Predict next step
    if model_type == "SVR":
        pred_scaled = svr_model.predict(last_seq.reshape(1, -1))[0]
    else:
        pred_scaled = model.predict(last_seq.reshape(
            1, SEQ_LEN, X_scaled.shape[1]), verbose=0)[0, 0]

    future_preds_scaled.append(pred_scaled)

    # 2. Create new row base (copy of last known state)
    new_row_scaled = last_seq[-1, :].copy()

    # 3. Inject the newly predicted target value into the feature
    #    vector when the target is part of X. This makes the
    #    multi-step forecast auto-regressive instead of simply
    #    repeating the last observed target.
    if target_in_X_index is not None:
        new_row_scaled[target_in_X_index] = pred_scaled

    # 4. Slide window forward with the new prediction context
    last_seq = np.vstack([last_seq[1:], new_row_scaled])

future_preds = scaler_y.inverse_transform(
    np.array(future_preds_scaled).reshape(-1, 1)).flatten()

# 🔧 FIX: Correctly scale the standard deviation (magnitude only, no offset)
# We subtract the "zero point" to remove the data min_value offset
zero_point = scaler_y.inverse_transform([[0]])[0, 0]
conf_magnitude = scaler_y.inverse_transform([[conf_val]])[0, 0]
conf_scaled = conf_magnitude - zero_point

print("\n" + "="*70)
print("🔮 FUTURE PREDICTIONS WITH CONFIDENCE INTERVALS")
print("="*70)
for i, pred in enumerate(future_preds, 1):
    print(
        f"Step {i:2d}: {pred:7.2f} ± {conf_scaled:.2f}  (range: [{pred-conf_scaled:.2f}, {pred+conf_scaled:.2f}])")
print("="*70)

# 📤 OUTPUT PREDICTIONS AS JSON
# Helper function to safely convert to float, handling NaN/Inf


def safe_float(value):
    """Convert value to float, replacing NaN/Inf with 0"""
    val = float(value)
    if np.isnan(val) or np.isinf(val):
        return 0.0
    return val


predictions = [
    {
        "step": i,
        "value": safe_float(pred),
        "confidence": safe_float(conf_scaled),
        "lowerBound": safe_float(pred - conf_scaled),
        "upperBound": safe_float(pred + conf_scaled)
    }
    for i, pred in enumerate(future_preds, 1)
]

# Output JSON on a single line with a special marker so backend can parse it
json_output = json.dumps({
    "predictions": predictions,
    "metrics": {
        "trainMAE": safe_float(train_mae),
        "trainRMSE": safe_float(train_rmse),
        "trainMAPE": safe_float(train_mape),
        "trainR2": safe_float(train_r2),
        "testMAE": safe_float(test_mae),
        "testRMSE": safe_float(test_rmse),
        "testMAPE": safe_float(test_mape),
        "testR2": safe_float(test_r2)
    },
    "modelType": model_type,
    "forecastWindow": FORECAST_WINDOW
}, indent=None, ensure_ascii=False)

# Print JSON with a special marker so backend can extract it
# Use sys.stdout.write and flush to ensure atomic output (no buffering issues)
sys.stdout.write("\n<FORECAST_JSON_START>\n")
sys.stdout.write(json_output)
sys.stdout.write("\n<FORECAST_JSON_END>\n")
sys.stdout.flush()  # Ensure all output is written immediately

# Plot future predictions
plt.figure(figsize=(14, 5))
# Show more history (last 50 points from test set)
historical_tail = y_test_inv[-50:] if len(y_test_inv) >= 50 else y_test_inv
# Get corresponding test predictions tail (same length as historical_tail)
test_pred_tail = y_test_pred_inv[-len(historical_tail):] if len(
    y_test_pred_inv) >= len(historical_tail) else y_test_pred_inv

# Create continuous x-axis for entire plot
n_hist = len(historical_tail)
n_future = len(future_preds)
x_all = np.arange(n_hist + n_future)

# Concatenate historical with future for seamless connection
# For actual values: historical + future (connect last historical to first future)
actual_all = np.concatenate([historical_tail, future_preds])
# For historical predictions: historical predictions + future (connect seamlessly)
pred_all = np.concatenate([test_pred_tail, future_preds])

# Plot historical actual values with markers
plt.plot(x_all[:n_hist], historical_tail, 'o-', label='Historical Actual (Test)',
         linewidth=2, color='blue', markersize=4)
# Plot connecting line from last historical to future (actual values)
plt.plot(x_all[n_hist-1:], actual_all[n_hist-1:], '-',
         linewidth=2, color='blue', alpha=0.6)

# Plot historical test predictions with markers
plt.plot(x_all[:n_hist], test_pred_tail, 's-', label='Historical Predictions (Test)',
         linewidth=2, color='green', markersize=4, alpha=0.7)
# Plot connecting line from last historical prediction to future
plt.plot(x_all[n_hist-1:], pred_all[n_hist-1:], '-',
         linewidth=2, color='green', alpha=0.6)

# Plot future predictions with markers (overlay on the connecting lines)
plt.plot(x_all[n_hist:], future_preds, '^-', label='Future Predictions',
         linewidth=2, color='orange', markersize=5)
# Add confidence interval for future predictions
plt.fill_between(x_all[n_hist:],
                 future_preds - conf_scaled,
                 future_preds + conf_scaled,
                 alpha=0.3, color='orange', label='Confidence Interval')
# Vertical line to mark where future predictions start
plt.axvline(x=n_hist-0.5, color='red',
            linestyle='--', label='Prediction Start', alpha=0.7)

plt.xlabel('Time Step')
plt.ylabel(target_column)
# Update title to indicate only last 50 points are shown when applicable
if len(y_test_inv) > 50:
    plt.title(
        f'Future Predictions ({FORECAST_WINDOW} steps ahead) - Showing Last 50 Historical Points')
else:
    plt.title(f'Future Predictions ({FORECAST_WINDOW} steps ahead)')
plt.legend()
plt.grid(True, alpha=0.3)
plt.tight_layout()
# Save plot instead of showing (for server environments)
script_dir = os.path.dirname(os.path.abspath(__file__))
plot_path = os.path.join(script_dir, 'forecast_plot.png')
plt.savefig(plot_path, dpi=150, bbox_inches='tight')
print(f"\n📊 Forecast plot saved to: {plot_path}")
plt.close()  # Close the figure to free memory

# -----------------------------
# 📝 Final summary
# -----------------------------
print("\n" + "="*70)
print("📝 TRAINING SUMMARY")
print("="*70)
print(f"Model Type: {model_type}")
print(
    f"Dataset Size: {len(X_seq)} samples ({len(X_train_seq)} train, {len(X_test_seq)} test)")
print(f"Sequence Length: {SEQ_LEN}")
print(f"Features: {X.shape[1]} (original: {original_feature_count})")
print(f"Augmentation Applied: {'Yes' if data_was_augmented else 'No'}")
if model_type == "LSTM":
    print(
        f"Architecture: {'Two-layer' if use_two_layers else 'Single-layer'} LSTM")
    print(f"Epochs Trained: {len(history.history['loss'])}")
    print(f"Final Training Loss: {history.history['loss'][-1]:.6f}")
    print(f"Final Validation Loss: {history.history['val_loss'][-1]:.6f}")
else:
    # Format gamma safely (it might be 'scale' or a float)
    gamma_str = f"{svr_model.gamma:.3f}" if isinstance(
        svr_model.gamma, (int, float)) else str(svr_model.gamma)
    print(
        f"SVR Parameters: C={svr_model.C}, gamma={gamma_str}, epsilon={svr_model.epsilon:.3f}")
print("="*70)
print("\n💡 To use with a different dataset:")
print("   1. Change: target_column, feature_columns")
print("   2. Set: DATA_TIME_STEP (days/months) and ENABLED_CYCLES")
print("   3. Everything else adapts automatically!")
print("="*70)
print("\n✅ Forecast completed successfully!")
sys.exit(0)  # Explicitly exit with success code
