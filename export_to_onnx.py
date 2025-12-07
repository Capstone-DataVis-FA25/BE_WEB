"""
Export PyTorch LSTM model to ONNX format
Adjust the model architecture to match your trained model
"""
import torch
import torch.nn as nn
import sys
import os

class LSTMPredictor(nn.Module):
    """
    LSTM model for quantity prediction
    IMPORTANT: Match these parameters with your training configuration!
    """
    def __init__(self, input_size=1, hidden_size=50, num_layers=1, output_size=1, dropout=0.2):
        super(LSTMPredictor, self).__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        
        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0
        )
        
        self.fc = nn.Linear(hidden_size, output_size)
    
    def forward(self, x):
        """
        Forward pass
        Args:
            x: Input tensor of shape (batch_size, sequence_length, input_size)
        Returns:
            predictions: Output tensor of shape (batch_size, output_size)
        """
        # LSTM output
        lstm_out, (hidden, cell) = self.lstm(x)
        
        # Use the last time step output
        last_output = lstm_out[:, -1, :]
        
        # Fully connected layer
        predictions = self.fc(last_output)
        
        return predictions

def export_to_onnx(
    model_path='src/model/lstm_quantity_predictor.pth',
    output_path='src/model/lstm_quantity_predictor.onnx',
    input_size=1,
    hidden_size=50,
    num_layers=1,
    sequence_length=10,
):
    """
    Export PyTorch model to ONNX format
    
    Args:
        model_path: Path to PyTorch .pth file
        output_path: Output path for ONNX model
        input_size: Number of input features (default: 1)
        hidden_size: LSTM hidden size (default: 50)
        num_layers: Number of LSTM layers (default: 1)
        sequence_length: Default sequence length for dynamic axes (default: 10)
    """
    print("=" * 60)
    print("PyTorch to ONNX Converter")
    print("=" * 60)
    
    # Check if model file exists
    if not os.path.exists(model_path):
        print(f"❌ Error: Model file not found at {model_path}")
        sys.exit(1)
    
    print(f"📂 Loading PyTorch model from: {model_path}")
    
    # Initialize model with same architecture as training
    model = LSTMPredictor(
        input_size=input_size,
        hidden_size=hidden_size,
        num_layers=num_layers,
        output_size=1,
        dropout=0.2
    )
    
    # Load trained weights
    try:
        checkpoint = torch.load(model_path, map_location='cpu')
        
        # Handle different save formats
        if isinstance(checkpoint, dict):
            if 'model_state_dict' in checkpoint:
                model.load_state_dict(checkpoint['model_state_dict'])
            elif 'state_dict' in checkpoint:
                model.load_state_dict(checkpoint['state_dict'])
            else:
                model.load_state_dict(checkpoint)
        else:
            model.load_state_dict(checkpoint)
            
        print("✅ Model weights loaded successfully")
    except Exception as e:
        print(f"❌ Error loading model: {e}")
        print("\n💡 Tips:")
        print("1. Make sure the model architecture matches your training code")
        print("2. Adjust input_size, hidden_size, num_layers parameters")
        print("3. Check if your model was saved with a different structure")
        sys.exit(1)
    
    # Set model to evaluation mode
    model.eval()
    
    # Create dummy input
    # Shape: (batch_size=1, sequence_length, input_size)
    dummy_input = torch.randn(1, sequence_length, input_size)
    
    print(f"🔄 Exporting to ONNX format...")
    print(f"   Input shape: (batch_size, sequence_length, {input_size})")
    print(f"   Output path: {output_path}")
    
    # Create output directory if it doesn't exist
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    # Export to ONNX
    try:
        torch.onnx.export(
            model,                              # Model to export
            dummy_input,                        # Example input
            output_path,                        # Output file
            export_params=True,                 # Export trained parameters
            opset_version=12,                   # ONNX version (12 is stable)
            do_constant_folding=True,           # Optimize constants
            input_names=['input'],              # Input tensor name
            output_names=['output'],            # Output tensor name
            dynamic_axes={                      # Dynamic dimensions
                'input': {
                    0: 'batch_size',
                    1: 'sequence_length'
                },
                'output': {
                    0: 'batch_size'
                }
            }
        )
        print("✅ Model exported successfully!")
        
        # Verify the exported model
        print("\n🔍 Verifying exported model...")
        import onnx
        onnx_model = onnx.load(output_path)
        onnx.checker.check_model(onnx_model)
        print("✅ ONNX model is valid!")
        
        print("\n" + "=" * 60)
        print("✨ Export Complete!")
        print("=" * 60)
        print(f"📁 ONNX model saved at: {output_path}")
        print("\n📋 Next Steps:")
        print("1. Install onnxruntime-node: npm install onnxruntime-node")
        print("2. Restart your NestJS server")
        print("3. Test the prediction endpoint: POST /prediction/quantity")
        print("\n💡 Test with curl:")
        print('   curl -X POST http://localhost:3000/prediction/quantity \\')
        print('     -H "Authorization: Bearer YOUR_TOKEN" \\')
        print('     -H "Content-Type: application/json" \\')
        print('     -d \'{"historicalData": [100, 120, 115, 130], "steps": 3}\'')
        
    except Exception as e:
        print(f"❌ Error exporting to ONNX: {e}")
        sys.exit(1)

if __name__ == "__main__":
    # Configuration - ADJUST THESE TO MATCH YOUR MODEL!
    CONFIG = {
        'model_path': 'src/model/lstm_quantity_predictor.pth',
        'output_path': 'src/model/lstm_quantity_predictor.onnx',
        'input_size': 1,        # Number of features per time step
        'hidden_size': 50,      # LSTM hidden layer size
        'num_layers': 1,        # Number of LSTM layers
        'sequence_length': 10,  # Default sequence length (can be dynamic)
    }
    
    print("\n⚙️  Configuration:")
    for key, value in CONFIG.items():
        print(f"   {key}: {value}")
    print()
    
    export_to_onnx(**CONFIG)
