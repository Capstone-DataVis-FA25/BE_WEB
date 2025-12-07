
#Link Kaggle test: https://www.kaggle.com/code/phanqucthibo/train-test


#cell 1
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
import pandas as pd
import numpy as np
from sklearn.preprocessing import MinMaxScaler, LabelEncoder
from sklearn.svm import SVR
from sklearn.metrics import mean_absolute_error
import matplotlib.pyplot as plt
import pickle, os

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
def create_sequences_lstm(df, sequence_length=30):
    df = df.sort_values("InvoiceDate").reset_index(drop=True)

    X_all, y_all = [], []

    values = df[['country_scaled', 'customer_scaled']].values
    qty = df['qty_scaled'].values

    for i in range(len(values) - sequence_length):
        X_all.append(values[i:i+sequence_length])
        y_all.append(qty[i+sequence_length])

    X_all = np.array(X_all)
    y_all = np.array(y_all)

    print("Sequences:", X_all.shape, y_all.shape)
    return X_all, y_all


sequence_length = 30
X_seq, y_seq = create_sequences_lstm(df)

split_idx = int(0.8 * len(X_seq))
X_train, X_test = X_seq[:split_idx], X_seq[split_idx:]
y_train, y_test = y_seq[:split_idx], y_seq[split_idx:]

X_train_tensor = torch.FloatTensor(X_train)
y_train_tensor = torch.FloatTensor(y_train).unsqueeze(1)
X_test_tensor = torch.FloatTensor(X_test)
y_test_tensor = torch.FloatTensor(y_test).unsqueeze(1)

train_dataset = TensorDataset(X_train_tensor, y_train_tensor)
train_loader = DataLoader(train_dataset, batch_size=64, shuffle=True)


#cell 3
class LSTMModel(nn.Module):
    def __init__(self, input_size, hidden_size, num_layers, output_size):
        super().__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, batch_first=True)
        self.fc = nn.Linear(hidden_size, output_size)

    def forward(self, x):
        h0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size)
        c0 = torch.zeros(self.num_layers, x.size(0), self.hidden_size)

        out, _ = self.lstm(x, (h0, c0))
        out = self.fc(out[:, -1, :])
        return out

model = LSTMModel(input_size=2, hidden_size=50, num_layers=2, output_size=1)
criterion = nn.MSELoss()
optimizer = optim.Adam(model.parameters(), lr=0.001)

epochs = 5
model.train()

for epoch in range(epochs):
    for batch_X, batch_y in train_loader:
        optimizer.zero_grad()
        outputs = model(batch_X)
        loss = criterion(outputs, batch_y)
        loss.backward()
        optimizer.step()
    print(f"Epoch {epoch+1}/{epochs} - Loss: {loss.item():.4f}")


#cell 4
model.eval()
with torch.no_grad():
    y_pred_test = model(X_test_tensor).numpy()

y_test_inv = scaler_y.inverse_transform(y_test.reshape(-1, 1)).flatten()
y_pred_test_inv = scaler_y.inverse_transform(y_pred_test).flatten()

print("LSTM MAE:", mean_absolute_error(y_test_inv, y_pred_test_inv))

plt.figure(figsize=(10,5))
plt.plot(y_test_inv[:100], label="Actual")
plt.plot(y_pred_test_inv[:100], label="Pred")
plt.legend()
plt.show()

#cell 5
# ==== EXPORT LSTM TO ONNX ====

import torch.onnx
import os

os.makedirs("export_js", exist_ok=True)

dummy_input = torch.randn(1, sequence_length, 2)

onnx_path = "export_js/lstm_quantity_predictor.onnx"

torch.onnx.export(
    model,
    dummy_input,
    onnx_path,
    input_names=["input"],
    output_names=["output"],
    dynamic_axes={
        "input": {0: "batch"},
        "output": {0: "batch"}
    }
)

print("✅ Exported LSTM to:", onnx_path)


# ===== SAVE PREPROCESSOR TO JSON (dùng cho JS) =====

import json

pre_json = {
    "scaler_y_min": float(scaler_y.data_min_[0]),
    "scaler_y_max": float(scaler_y.data_max_[0]),
}

with open("export_js/preprocessor.json", "w") as f:
    json.dump(pre_json, f, indent=4)

print("✅ Saved preprocessors to preprocessor.json")

!ls export_js


