"""
Script to convert PyTorch LSTM model to ONNX format
Run this script in the same directory as your .pth file
"""
import torch
import torch.nn as nn

class LSTMPredictor(nn.Module):
    """
    LSTM model for quantity prediction
    Adjust architecture parameters to match your trained model
    """
    def __init__(self, input_size=1, hidden_size=50, num_layers=1, output_size=1):
        super(LSTMPredictor, self).__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        
        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=0 if num_layers == 1 else 0.2
        )
        self.fc = nn.Linear(hidden_size, output_size)
    
    def forward(self, x):
        # x shape: (batch_size, sequence_length, input_size)
        lstm_out, (hidden, cell) = self.lstm(x)
        # Use last output
        last_output = lstm_out[:, -1, :]
        predictions = self.fc(last_output)
        return predictions

def convert_to_onnx():
    """Convert PyTorch model to ONNX format"""
    print("🔄 Loading PyTorch model...")
    
    # Initialize model with same architecture as training
    # IMPORTANT: Adjust these parameters to match your trained model!
    model = LSTMPredictor(
        input_size=1,      # Number of features
        hidden_size=50,    # LSTM hidden units
        num_layers=1,      # Number of LSTM layers
        output_size=1      # Prediction output size
    )
    
    # Load trained weights
    model_path = 'src/model/lstm_quantity_predictor.pth'
    try:
        model.load_state_dict(torch.load(model_path, map_location='cpu'))
        print(f"✅ Model loaded from {model_path}")
    except Exception as e:
        print(f"❌ Error loading model: {e}")
        print("Make sure the model architecture matches your trained model!")
        return
    
    model.eval()
    
    # Create dummy input for ONNX export
    # Shape: (batch_size, sequence_length, features)
    sequence_length = 10  # Adjust based on your training
    dummy_input = torch.randn(1, sequence_length, 1)
    
    print("🔄 Exporting to ONNX...")
    output_path = 'src/model/lstm_quantity_predictor.onnx'
    
    try:
        torch.onnx.export(
            model,                           # Model to export
            dummy_input,                     # Example input
            output_path,                     # Output file path
            export_params=True,              # Export trained parameters
            opset_version=11,                # ONNX version
            do_constant_folding=True,        # Optimize constants
            input_names=['input'],           # Input tensor names
            output_names=['output'],         # Output tensor names
            dynamic_axes={                   # Dynamic dimensions
                'input': {
                    0: 'batch_size',
                    1: 'sequence_length'
                },
                'output': {
                    0: 'batch_size'
                }
            }
        )
        print(f"✅ Model exported to {output_path}")
        print("\n📋 Next steps:")
        print("1. Install ONNX-TF: pip install onnx-tf tensorflowjs")
        print("2. Convert to TensorFlow.js:")
        print(f"   onnx-tf convert -i {output_path} -o src/model/tfjs_model/")
        print("3. Update prediction.service.ts to load from src/model/tfjs_model/")
        
    except Exception as e:
        print(f"❌ Error exporting to ONNX: {e}")

if __name__ == "__main__":
    convert_to_onnx()
