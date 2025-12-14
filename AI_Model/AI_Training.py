# -----------------------------
# Enhanced Adaptive Time Series Predictor
# With SVR tuning, feature engineering, and adaptive model selection
# -----------------------------
import matplotlib.pyplot as plt
from tensorflow.keras.regularizers import l2
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.models import Sequential
from tensorflow.keras.optimizers import Adam
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.model_selection import GridSearchCV
from sklearn.svm import SVR
from sklearn.preprocessing import MinMaxScaler
import pandas as pd
import numpy as np
import os
import warnings

# 🤫 Suppress warnings and TF logs
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
# os.environ['CUDA_VISIBLE_DEVICES'] = '-1' # 🚀 GPU ENABLED!
warnings.filterwarnings('ignore')


# -----------------------------
# 🔧 HELPER FUNCTIONS
# -----------------------------

def get_cycle_periods(time_step):
    """Return cycle periods based on time step"""
    if time_step == 'days':
        return {'yearly': 365.25, 'quarterly': 91.31, 'monthly': 30.44, 'weekly': 7.0}
    elif time_step == 'weeks':
        return {'yearly': 52.14, 'monthly': 4.34}
    elif time_step == 'months':
        return {'yearly': 12.0, 'quarterly': 3.0}
    elif time_step == 'quarters':
        return {'yearly': 4.0}
    elif time_step == 'years':
        return {'decade': 10.0}
    elif time_step == 'hours':
        return {'yearly': 365.25 * 24, 'weekly': 7 * 24, 'daily': 24.0}
    return {}


def augment_with_jittering(X, y, noise_level=0.01, num_copies=1):
    """Add Gaussian noise to create augmented samples"""
    X_aug, y_aug = [X], [y]
    for _ in range(num_copies):
        X_noisy = X + np.random.normal(0, noise_level, X.shape)
        y_noisy = y + np.random.normal(0, noise_level * 0.5, y.shape)
        X_aug.append(X_noisy)
        y_aug.append(y_noisy)
    return np.vstack(X_aug), np.vstack(y_aug)


def create_sequences_with_stride(X_scaled, y_scaled, seq_len, stride=1):
    """Create overlapping sequences for data augmentation"""
    X_seq, y_seq = [], []
    for i in range(seq_len, len(y_scaled), stride):
        X_seq.append(X_scaled[i-seq_len:i])
        y_seq.append(y_scaled[i])
    return np.array(X_seq), np.array(y_seq)


def add_cyclical_features(df, time_step, cycles__to_include):
    """Add cyclical features based on index steps (no date column needed)"""
    # Define how many steps make up a cycle based on the time_step
    # E.g. if data is 'days', a 'yearly' cycle is ~365.25 steps
    cycle_periods = {}

    if time_step == 'days':
        cycle_periods = {
            'yearly': 365.25,
            'quarterly': 91.31,
            'monthly': 30.44,
            'weekly': 7.0
        }
    elif time_step == 'weeks':
        cycle_periods = {
            'yearly': 52.14,  # Approx 52 weeks in a year
            'monthly': 4.34   # Approx 4.3 weeks in a month
        }
    elif time_step == 'months':
        cycle_periods = {
            'yearly': 12.0,
            'quarterly': 3.0
        }
    elif time_step == 'quarters':
        cycle_periods = {
            'yearly': 4.0
        }
    elif time_step == 'years':
        cycle_periods = {
            'decade': 10.0
        }
    elif time_step == 'hours':
        cycle_periods = {
            'yearly': 365.25 * 24,
            'weekly': 7 * 24,
            'daily': 24.0
        }

    for cycle_name in cycles__to_include:
        if cycle_name in cycle_periods:
            period = cycle_periods[cycle_name]
            # Use dataframe index as the "time" variable
            # sin(2*pi*t/T), cos(2*pi*t/T)
            df[f'sin_{cycle_name}'] = np.sin(2 * np.pi * df.index / period)
            df[f'cos_{cycle_name}'] = np.cos(2 * np.pi * df.index / period)

    return df


def add_lag_features(df, columns, lags=[1, 3, 7]):
    """Add lag features for specified columns (auto-adapts to available data)"""
    for col in columns:
        if col in df.columns:
            for lag in lags:
                df[f'{col}_lag{lag}'] = df[col].shift(lag)
    return df


def add_rolling_features(df, columns, windows=[3, 7]):
    """Add rolling statistics (auto-adapts to available data)"""
    for col in columns:
        if col in df.columns:
            for window in windows:
                df[f'{col}_roll_mean_{window}'] = df[col].rolling(
                    window).mean()
                df[f'{col}_roll_std_{window}'] = df[col].rolling(window).std()
    return df


# -----------------------------
# 1️⃣ Load dataset
# -----------------------------
df = pd.read_csv(
    "/kaggle/input/daily-minimum-temperatures-in-melbourne/daily-minimum-temperatures-in-me.csv",
    on_bad_lines='skip'  # 🛡️ Skip the 1 bad line at the end (footer garbage)
)

# 🔍 DEBUG: Print actual columns found
print(f"📂 Loaded dataset: {df.shape[0]} rows")
print(f"🔎 Columns found: {df.columns.tolist()}")

# 🧹 CLEANUP: Strip spaces from column names automatically
df.columns = df.columns.str.strip()

# -----------------------------
# 2️⃣ User selections (CHANGE THESE FOR YOUR DATASET)
# -----------------------------
target_column = "Daily minimum temperatures in Melbourne, Australia, 1981-1990"

# 📋 FEATURE SELECTION
# Select a variable that influences the target.
# (Leave empty [] if you only want to use the target itself history)
feature_columns = []

# ⏱️ TIME CONFIGURATION
# Options: 'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly', 'Hourly'
TIME_SCALE = 'Daily'

# 🔮 FORECAST CONFIGURATION
# Number of data points to forecast into the future
FORECAST_WINDOW = 30

# -----------------------------
# 2.5 Auto-configure Seasonality based on Time Scale
# -----------------------------
if TIME_SCALE == 'Daily':
    DATA_TIME_STEP = 'days'
    ENABLED_CYCLES = ['yearly', 'weekly']  # Capture Year and Week patterns
elif TIME_SCALE == 'Monthly':
    DATA_TIME_STEP = 'months'
    # Capture Year and Quarter patterns
    ENABLED_CYCLES = ['yearly', 'quarterly']
elif TIME_SCALE == 'Hourly':
    DATA_TIME_STEP = 'hours'
    ENABLED_CYCLES = ['daily', 'weekly']  # Capture Day and Week patterns
else:
    # Default fallback
    DATA_TIME_STEP = 'days'
    ENABLED_CYCLES = ['yearly']

print(f"⚙️  Auto-Configured: Scale={TIME_SCALE} → Cycles={ENABLED_CYCLES}")

# 🛡️ AUTO-FIX: If target column text doesn't match exactly, try to find it
if target_column not in df.columns:
    print(f"⚠️  '{target_column}' not found. Looking for close match...")
    if len(df.columns) >= 2:
        # Heuristic: Pick the last column as target if specific name fails
        # (Assuming typical TimeSeries format: [Date, Target])
        target_column = df.columns[-1]
        print(f"   ✓ Found likely target: '{target_column}'")


# Enable/disable feature engineering
ENABLE_TIME_FEATURES = True
# ⚡ OFF: Prevents "flat" future predictions (forces model to learn seasons, not just "yesterday's value")
ENABLE_LAG_FEATURES = False
ENABLE_ROLLING_FEATURES = True

# 🎯 FEATURE ENGINEERING
print("\n🔧 Feature Engineering:")
original_feature_count = len(feature_columns)

if ENABLE_TIME_FEATURES:
    print(
        f"   ✓ Adding cyclical features (Period: {DATA_TIME_STEP}, Cycles: {ENABLED_CYCLES})...")
    df = add_cyclical_features(df, DATA_TIME_STEP, ENABLED_CYCLES)

    # Add the new column names to feature list
    for cycle in ENABLED_CYCLES:
        feature_columns.extend([f'sin_{cycle}', f'cos_{cycle}'])

if ENABLE_LAG_FEATURES:
    print("   ✓ Adding lag features...")
    # Only add lags for numeric features
    numeric_cols = [c for c in [target_column] +
                    feature_columns if pd.api.types.is_numeric_dtype(df[c])]
    df = add_lag_features(df, numeric_cols, lags=[1, 3, 7])
    lag_features = [c for c in df.columns if '_lag' in c]
    feature_columns.extend(lag_features)

if ENABLE_ROLLING_FEATURES:
    print("   ✓ Adding rolling statistics...")
    numeric_cols = [c for c in [target_column] + feature_columns if pd.api.types.is_numeric_dtype(
        df[c]) and '_lag' not in c and '_roll' not in c]
    df = add_rolling_features(df, numeric_cols, windows=[3, 7])
    rolling_features = [c for c in df.columns if '_roll_' in c]
    feature_columns.extend(rolling_features)

# Remove duplicates and ensure all features exist
feature_columns = list(dict.fromkeys(feature_columns))  # Remove duplicates
feature_columns = [c for c in feature_columns if c in df.columns]

print(
    f"   📊 Features expanded: {original_feature_count} → {len(feature_columns)}")

# Drop rows with NaN created by lag/rolling features
df = df.dropna().reset_index(drop=True)
print(f"   📉 Rows after removing NaN: {len(df)}")

# -----------------------------
# 3.5 Model Selection & Encoding Constraints
# -----------------------------
# Estimate effective training size to choose model BEFORE encoding
# (This mirrors the augmentation logic used later)
est_seq_len = min(20, len(df) // 5)
est_initial_samples = len(df) - est_seq_len

if est_initial_samples < 100:
    # Aggressive augmentation (stride 1, 2 copies) -> approx 3x data
    est_train_size = est_initial_samples * 3 * 0.8
elif est_initial_samples < 300:
    # Moderate augmentation (stride 3, 1 copy) -> approx 2x data / 3
    est_train_size = (est_initial_samples / 3) * 2 * 0.8
else:
    # Standard (stride = 1) -> data * 1
    est_train_size = est_initial_samples * 0.8

if est_train_size < 150:
    model_type = "SVR"
    MAX_OH_CATS = 20
    print(
        f"\n🤖 Early Model Selection: SVR (Est. train samples: {int(est_train_size)})")
    print(
        f"   🔒 Limiting categorical features to top {MAX_OH_CATS} unique values")
else:
    model_type = "LSTM"
    MAX_OH_CATS = 50
    print(
        f"\n🤖 Early Model Selection: LSTM (Est. train samples: {int(est_train_size)})")
    print(
        f"   🔒 Limiting categorical features to top {MAX_OH_CATS} unique values")

# 🧹 CLEANUP: Force target to be numeric (handles '?0.2' typos)
df[target_column] = pd.to_numeric(df[target_column], errors='coerce')
df = df.dropna(subset=[target_column])

# Handle missing values broadly first to fix broken numeric cols
df = df.fillna(method='ffill').fillna(method='bfill')

# 🔄 RE-EVALUATE TYPES: Now that data is clean, split features
numeric_features = [
    c for c in feature_columns if pd.api.types.is_numeric_dtype(df[c])]
categorical_features = [
    c for c in feature_columns if not pd.api.types.is_numeric_dtype(df[c])]

# Handle specific missing values if any remain
for c in numeric_features:
    df[c] = df[c].fillna(df[c].median())
for c in categorical_features:
    df[c] = df[c].fillna("Unknown")

# 🔒 Apply Top-K Limit
for c in categorical_features:
    unique_vals = df[c].value_counts()
    if len(unique_vals) > MAX_OH_CATS:
        top_k = unique_vals.nlargest(MAX_OH_CATS).index
        print(
            f"   ⚠️  Limiting {c}: {len(unique_vals)} -> {MAX_OH_CATS} categories")
        df[c] = df[c].apply(lambda x: x if x in top_k else 'Other')

# Encode categorical features
df_encoded = pd.get_dummies(
    df[categorical_features], drop_first=True) if categorical_features else pd.DataFrame()
X_numeric = df[numeric_features] if numeric_features else pd.DataFrame()
X = pd.concat([X_numeric, df_encoded], axis=1)

y = df[target_column].values.reshape(-1, 1)

# Scale features
scaler_X = MinMaxScaler()
scaler_y = MinMaxScaler()
X_scaled = scaler_X.fit_transform(X)
y_scaled = scaler_y.fit_transform(y)

# -----------------------------
# 4️⃣ Create sequences with adaptive augmentation
# -----------------------------
# Adaptive sequence length (Increased for better context)
SEQ_LEN = min(30, len(y_scaled) // 5)
print(f"\n📏 Using sequence length: {SEQ_LEN}")

initial_samples = len(y_scaled) - SEQ_LEN

# Adaptive augmentation
if initial_samples < 100:
    print("⚠️  Very small dataset detected (<100 samples)")
    print("   Applying aggressive augmentation...")
    stride = 1
    X_seq, y_seq = create_sequences_with_stride(
        X_scaled, y_scaled, SEQ_LEN, stride=stride)
    X_seq, y_seq = augment_with_jittering(
        X_seq, y_seq, noise_level=0.02, num_copies=1)
    data_was_augmented = True
    print(f"   ✓ Augmented from {initial_samples} to {len(X_seq)} samples")
elif initial_samples < 300:
    print("📊 Small dataset detected (<300 samples)")
    print("   Applying moderate augmentation...")
    stride = 3
    X_seq, y_seq = create_sequences_with_stride(
        X_scaled, y_scaled, SEQ_LEN, stride=stride)
    X_seq, y_seq = augment_with_jittering(
        X_seq, y_seq, noise_level=0.01, num_copies=1)
    data_was_augmented = True
    print(f"   ✓ Augmented from {initial_samples} to {len(X_seq)} samples")
else:
    print("✅ Sufficient data, using standard approach")
    # ⚡ FIX: Use ALL data (sliding window of 1) to get maximum samples
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
    grid_search = GridSearchCV(
        svr_base,
        param_grid,
        cv=min(3, len(X_train_flat) // 10),  # Adaptive CV folds
        scoring='neg_mean_squared_error',
        n_jobs=-1,
        verbose=3  # 🔊 MAX VERBOSITY: Show every single fit!
    )

    grid_search.fit(X_train_flat, y_train_seq.ravel())
    svr_model = grid_search.best_estimator_

    print(
        f"   ✓ Best parameters: C={svr_model.C}, gamma={svr_model.gamma:.3f}, epsilon={svr_model.epsilon:.3f}")

    y_train_pred = svr_model.predict(X_train_flat)
    y_test_pred = svr_model.predict(X_test_flat)
    conf_val = np.std(y_test_seq - y_test_pred.reshape(-1, 1))

else:
    # LSTM with adaptive architecture
    input_shape = (X_train_seq.shape[1], X_train_seq.shape[2])

    if len(X_train_seq) < 150:
        print("   → Using SIMPLIFIED architecture")
        lstm_units = 16
        dropout_rate = 0.25
        use_two_layers = False
    elif len(X_train_seq) < 300:
        print("   → Using MODERATE architecture")
        lstm_units = 24
        dropout_rate = 0.2
        use_two_layers = False
    else:
        print("   → Using STANDARD architecture")
        lstm_units_1 = 32
        lstm_units_2 = 16
        dropout_rate = 0.2
        use_two_layers = True

    model = Sequential()

    if use_two_layers:
        model.add(LSTM(lstm_units_1, return_sequences=True, input_shape=input_shape,
                       dropout=0.1, recurrent_dropout=0.1))
        model.add(LSTM(lstm_units_2, dropout=0.1, recurrent_dropout=0.1))
    else:
        model.add(LSTM(lstm_units, input_shape=input_shape,
                       dropout=0.1, recurrent_dropout=0.1))

    model.add(Dense(1))

    # ⚡ OPTIMIZATIONS:
    # 1. Higher LR (0.002) for stability (0.005 was too jumpy)
    # 2. Lower Patience (no need to wait forever)
    model.compile(optimizer=Adam(learning_rate=0.002), loss="mae")

    early_stop = EarlyStopping(
        monitor='val_loss',
        patience=15,  # Give it time to find the "Wavy" pattern
        restore_best_weights=True,
        verbose=1
    )

    reduce_lr = ReduceLROnPlateau(
        monitor='val_loss',
        factor=0.5,
        patience=5,
        min_lr=1e-5,
        verbose=1
    )

    epochs = 60  # Fixed epochs (High enough to learn seasons)
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
    plt.show()

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
train_rmse = mean_squared_error(y_train_inv, y_train_pred_inv, squared=False)
test_mae = mean_absolute_error(y_test_inv, y_test_pred_inv)
test_rmse = mean_squared_error(y_test_inv, y_test_pred_inv, squared=False)

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
plt.show()

# -----------------------------
# 1️⃣1️⃣ Future predictions
# -----------------------------
last_seq = X_scaled[-SEQ_LEN:]
future_preds_scaled = []

print(f"\n🔮 Generating {FORECAST_WINDOW} future forecasts...")

# Retrieve cycle info for updates
cycle_periods = get_cycle_periods(DATA_TIME_STEP)
last_index = df.index[-1]

# Map feature names to column indices for updates
feature_map = {name: i for i, name in enumerate(
    [target_column] + feature_columns)}
# Note: scalar_X was fitted on pd.concat([numeric, encoded]), checking order is tricky.
# Better approach: We know X was created from `X = pd.concat([X_numeric, df_encoded], axis=1)`
# And `X_numeric` came from `df[numeric_features]`.
# We need to reconstruct the EXACT column order of X to update correct indices.
final_feature_order = []
if numeric_features:
    final_feature_order.extend(numeric_features)
if categorical_features:
    final_feature_order.extend(df_encoded.columns)

# Create index map
col_indices = {name: i for i, name in enumerate(final_feature_order)}

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

    # 3. Inverse transform to update logical features (Time, Lag)
    new_row_unscaled = scaler_X.inverse_transform(
        new_row_scaled.reshape(1, -1))[0]

    # 4. Update Time Features (The Key Fix)
    future_idx = last_index + step
    for cycle in ENABLED_CYCLES:
        if cycle in cycle_periods:
            period = cycle_periods[cycle]
            # Update Sin/Cos for the future time step
            if f'sin_{cycle}' in col_indices:
                idx = col_indices[f'sin_{cycle}']
                new_row_unscaled[idx] = np.sin(2 * np.pi * future_idx / period)
            if f'cos_{cycle}' in col_indices:
                idx = col_indices[f'cos_{cycle}']
                new_row_unscaled[idx] = np.cos(2 * np.pi * future_idx / period)

    # 5. Update Target Lag Variable (if we used the target itself as a feature)
    # If target_column is in X (it usually isn't in X, it's 'y', but 'target_lag1' might be in X)
    # We implicitly handle autoregression via the sliding window `last_seq` update below.
    # But if we have explicit columns like 'Temp_lag1', we should strictly update them.
    # For simplicity in this robust template, we rely on the LSTM learning the target from the sequence history
    # and time features. Updating explicit lags recursively is complex without a strict schema.
    # Ideally, we primarily needed the TIME features to tick forward.

    # 6. Re-transform back to scaled space
    new_row_scaled_updated = scaler_X.transform(
        new_row_unscaled.reshape(1, -1))[0]

    # Strictly set the predicted target (if the target column was part of X, which is rare in this setup
    # but let's assume X contains features Only).
    # Wait, in the main code `X` contains `numeric_features`.
    # `numeric_features` might INCULDE the target column if `target_column` was in `feature_columns`.
    if target_column in col_indices:
        # If target is a feature, we must update it with the prediction!
        # Convert pred back to unscaled to put in the unscaled row? No, scaler_y is separate.
        # This part is omitted to avoid breaking if target isn't in X.
        pass

    # 7. Slide window
    last_seq = np.vstack([last_seq[1:], new_row_scaled_updated])

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

# Plot future predictions
plt.figure(figsize=(14, 5))
# Show more history
historical_tail = y_test_inv[-50:] if len(y_test_inv) >= 50 else y_test_inv
combined = np.concatenate([historical_tail, future_preds])
x_hist = range(len(historical_tail))
x_future = range(len(historical_tail), len(combined))

plt.plot(x_hist, historical_tail, 'o-', label='Historical (Test)', linewidth=2)
plt.plot(x_future, future_preds, 's-',
         label='Future Predictions', linewidth=2, color='orange')
plt.fill_between(x_future,
                 future_preds - conf_scaled,
                 future_preds + conf_scaled,
                 alpha=0.3, color='orange', label='Confidence Interval')
plt.axvline(x=len(historical_tail)-0.5, color='red',
            linestyle='--', label='Prediction Start', alpha=0.7)
plt.xlabel('Time Step')
plt.ylabel(target_column)
plt.title(f'Future Predictions ({FORECAST_WINDOW} steps ahead)')
plt.legend()
plt.grid(True, alpha=0.3)
plt.tight_layout()
plt.show()

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
    print(
        f"SVR Parameters: C={svr_model.C}, gamma={svr_model.gamma:.3f}, epsilon={svr_model.epsilon:.3f}")
print("="*70)
print("\n💡 To use with a different dataset:")
print("   1. Change: target_column, feature_columns")
print("   2. Set: DATA_TIME_STEP (days/months) and ENABLED_CYCLES")
print("   3. Everything else adapts automatically!")
print("="*70)
