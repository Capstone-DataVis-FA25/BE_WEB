#Link Kaggle test: https://www.kaggle.com/code/phanqucthibo/train-test

#cell 1
import pandas as pd
import numpy as np
from sklearn.preprocessing import MinMaxScaler, LabelEncoder
from sklearn.svm import SVR
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import matplotlib.pyplot as plt
import pickle
import json
import os

# Load data từ Kaggle path
def load_data(data_path="/kaggle/input/ecommerce-data/data.csv"):
    df = pd.read_csv(data_path, encoding="ISO-8859-1")

    df['InvoiceDate'] = pd.to_datetime(df['InvoiceDate'])
    df = df[df['Quantity'] > 0]
    df = df.dropna(subset=['CustomerID'])

    df['day'] = df['InvoiceDate'].dt.day
    df['month'] = df['InvoiceDate'].dt.month
    df['year'] = df['InvoiceDate'].dt.year
    df['day_of_week'] = df['InvoiceDate'].dt.dayofweek

    le_country = LabelEncoder()
    le_customer = LabelEncoder()

    df['country_encoded'] = le_country.fit_transform(df['Country'])
    df['customer_encoded'] = le_customer.fit_transform(df['CustomerID'])

    df_group = df.groupby(['InvoiceDate', 'country_encoded', 'customer_encoded']).agg({
        'Quantity': 'sum'
    }).reset_index()

    scaler_X = MinMaxScaler()
    scaler_y = MinMaxScaler()

    X = df_group[['country_encoded', 'customer_encoded']]
    y = df_group['Quantity'].values.reshape(-1, 1)

    X_scaled = scaler_X.fit_transform(X)
    y_scaled = scaler_y.fit_transform(y)

    df_group['country_scaled'] = X_scaled[:, 0]
    df_group['customer_scaled'] = X_scaled[:, 1]
    df_group['qty_scaled'] = y_scaled

    print("Processed:", df_group.shape)
    return df_group, scaler_X, scaler_y, le_country, le_customer

df, scaler_X, scaler_y, le_country, le_customer = load_data()


#cell 2
def create_sequences_svr(df, sequence_length=30):
    """
    Tạo sequences cho SVR - flatten thành vector 1D
    SVR không xử lý sequences như LSTM, nên ta sẽ flatten
    """
    df = df.sort_values("InvoiceDate").reset_index(drop=True)

    X_all, y_all = [], []

    values = df[['country_scaled', 'customer_scaled']].values
    qty = df['qty_scaled'].values

    for i in range(len(values) - sequence_length):
        # Flatten sequence thành vector 1D
        seq_flat = values[i:i+sequence_length].flatten()
        X_all.append(seq_flat)
        y_all.append(qty[i+sequence_length])

    X_all = np.array(X_all)
    y_all = np.array(y_all)

    print("Sequences for SVR:", X_all.shape, y_all.shape)
    return X_all, y_all


sequence_length = 30
X_seq, y_seq = create_sequences_svr(df)

# Split train/test
split_idx = int(0.8 * len(X_seq))
X_train, X_test = X_seq[:split_idx], X_seq[split_idx:]
y_train, y_test = y_seq[:split_idx], y_seq[split_idx:]

print(f"Train shape: {X_train.shape}, Test shape: {X_test.shape}")


#cell 3
# Training SVR Model
print("Training SVR Model...")

# SVR với RBF kernel
svr_model = SVR(
    kernel='rbf',      # Radial Basis Function kernel
    C=100,             # Regularization parameter
    gamma='scale',     # Kernel coefficient
    epsilon=0.1        # Epsilon-tube
)

svr_model.fit(X_train, y_train)

print("✅ SVR Training completed!")


#cell 4
# Evaluation
print("\n=== Evaluating SVR Model ===")

y_pred_train = svr_model.predict(X_train)
y_pred_test = svr_model.predict(X_test)

# Inverse transform để về scale gốc
y_train_inv = scaler_y.inverse_transform(y_train.reshape(-1, 1)).flatten()
y_pred_train_inv = scaler_y.inverse_transform(y_pred_train.reshape(-1, 1)).flatten()

y_test_inv = scaler_y.inverse_transform(y_test.reshape(-1, 1)).flatten()
y_pred_test_inv = scaler_y.inverse_transform(y_pred_test.reshape(-1, 1)).flatten()

# Metrics
train_mae = mean_absolute_error(y_train_inv, y_pred_train_inv)
test_mae = mean_absolute_error(y_test_inv, y_pred_test_inv)

train_mse = mean_squared_error(y_train_inv, y_pred_train_inv)
test_mse = mean_squared_error(y_test_inv, y_pred_test_inv)

train_r2 = r2_score(y_train_inv, y_pred_train_inv)
test_r2 = r2_score(y_test_inv, y_pred_test_inv)

print(f"Train MAE: {train_mae:.4f}")
print(f"Test MAE:  {test_mae:.4f}")
print(f"Train MSE: {train_mse:.4f}")
print(f"Test MSE:  {test_mse:.4f}")
print(f"Train R²:  {train_r2:.4f}")
print(f"Test R²:   {test_r2:.4f}")

# Visualization
plt.figure(figsize=(12, 5))

plt.subplot(1, 2, 1)
plt.plot(y_test_inv[:100], label="Actual", marker='o', markersize=3)
plt.plot(y_pred_test_inv[:100], label="Predicted", marker='x', markersize=3)
plt.legend()
plt.title("SVR Predictions vs Actual (First 100 samples)")
plt.xlabel("Sample")
plt.ylabel("Quantity")

plt.subplot(1, 2, 2)
plt.scatter(y_test_inv, y_pred_test_inv, alpha=0.5)
plt.plot([y_test_inv.min(), y_test_inv.max()], 
         [y_test_inv.min(), y_test_inv.max()], 
         'r--', lw=2)
plt.xlabel("Actual Quantity")
plt.ylabel("Predicted Quantity")
plt.title("Actual vs Predicted")
plt.tight_layout()
plt.show()


#cell 5
# ==== EXPORT SVR MODEL ====

os.makedirs("export_js", exist_ok=True)

# Save SVR model
model_path = "export_js/svr_quantity_predictor.pkl"
with open(model_path, "wb") as f:
    pickle.dump(svr_model, f)

print(f"✅ Exported SVR model to: {model_path}")

# ===== SAVE PREPROCESSOR & CONFIG TO JSON =====

config_json = {
    "model_type": "SVR",
    "sequence_length": sequence_length,
    "input_features": 2,  # country_scaled, customer_scaled
    "scaler_X_min": scaler_X.data_min_.tolist(),
    "scaler_X_max": scaler_X.data_max_.tolist(),
    "scaler_y_min": float(scaler_y.data_min_[0]),
    "scaler_y_max": float(scaler_y.data_max_[0]),
    "metrics": {
        "test_mae": float(test_mae),
        "test_mse": float(test_mse),
        "test_r2": float(test_r2)
    }
}

config_path = "export_js/preprocessor.json"
with open(config_path, "w") as f:
    json.dump(config_json, f, indent=4)

print(f"✅ Saved config to: {config_path}")

# Save scalers
with open("export_js/scaler_X.pkl", "wb") as f:
    pickle.dump(scaler_X, f)
    
with open("export_js/scaler_y.pkl", "wb") as f:
    pickle.dump(scaler_y, f)

print("✅ Saved scalers")

# List exported files
print("\n📁 Exported files:")
os.system("ls -lh export_js")