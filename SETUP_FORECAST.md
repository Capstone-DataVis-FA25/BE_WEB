# Forecast Feature Setup Guide

This guide will help your teammate set up the forecast feature after pulling the latest code.

## Prerequisites

- Node.js (v18 or v20)
- PostgreSQL database
- Python 3.8+ (for AI/ML forecasting)
- pip (Python package manager)

## Step 1: Install Node.js Dependencies

```bash
cd BE_WEB
npm install
```

## Step 2: Database Setup (Prisma)

The Forecast model has been added to the schema. You need to:

### 2.1. Generate Prisma Client
```bash
npm run prisma:generate
# or
npx prisma generate
```

### 2.2. Push Database Schema Changes
```bash
npx prisma db push
```

**OR** if you prefer migrations:
```bash
npm run prisma:migrate
# or
npx prisma migrate dev --name add_forecast_model
```

### 2.3. (Optional) Verify in Prisma Studio
```bash
npm run prisma:studio
```

## Step 3: Python Environment Setup

The forecast feature uses Python for AI/ML model training (LSTM, SVR). You need to set up a Python virtual environment.

### 3.1. Create Virtual Environment (if not exists)
```bash
# Windows
python -m venv venv_tf

# Linux/Mac
python3 -m venv venv_tf
```

### 3.2. Activate Virtual Environment

**Windows (PowerShell):**
```powershell
.\venv_tf\Scripts\Activate.ps1
```

**Windows (CMD):**
```cmd
venv_tf\Scripts\activate.bat
```

**Linux/Mac:**
```bash
source venv_tf/bin/activate
```

### 3.3. Install Python Dependencies

**Option 1: Using requirements.txt (Recommended)**
```bash
pip install -r requirements.txt
```

**Option 2: Manual installation**
```bash
pip install numpy pandas scikit-learn tensorflow matplotlib
```

**Option 3: Specific versions**
```bash
pip install numpy==1.24.3 pandas==2.0.3 scikit-learn==1.3.0 tensorflow==2.13.0 matplotlib==3.7.2
```

### 3.4. Verify Installation
```bash
python -c "import numpy, pandas, sklearn, tensorflow, matplotlib; print('All packages installed successfully!')"
```

## Step 4: Environment Variables

Make sure your `.env` file has these variables (if not already set):

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/datavis_db"

# AI/ML (for forecast analysis)
GEMINI_API_KEY=your-gemini-api-key
# or
OPENROUTER_API_KEY=your-openrouter-key
OPENAI_API_KEY=your-openai-key
```

## Step 5: Verify Setup

### 5.1. Test Database Connection
```bash
npm run prisma:studio
# Should open Prisma Studio and show the Forecast table
```

### 5.2. Test Python Script
```bash
# Make sure venv is activated
python src/modules/ai/ai-model/AI_Training.py
# Should show help/usage information
```

### 5.3. Start the Backend
```bash
npm run start:dev
```

## Troubleshooting

### Issue: Prisma Client not generated
```bash
# Delete node_modules/.prisma and regenerate
rm -rf node_modules/.prisma
npm run prisma:generate
```

### Issue: Python packages not found
- Make sure virtual environment is activated
- Check Python version: `python --version` (should be 3.8+)
- Try reinstalling: `pip install --upgrade pip` then reinstall packages

### Issue: TensorFlow installation fails
- On Windows, you might need Visual C++ Redistributable
- Try: `pip install tensorflow-cpu` instead of `tensorflow` (lighter version)

### Issue: Database migration fails
- Check DATABASE_URL in .env file
- Ensure PostgreSQL is running
- Check database permissions

## Quick Setup Script (Optional)

You can create a setup script to automate this:

**Windows (`setup-forecast.bat`):**
```batch
@echo off
echo Installing Node.js dependencies...
call npm install

echo Generating Prisma client...
call npm run prisma:generate

echo Pushing database schema...
call npx prisma db push

echo Setting up Python environment...
call python -m venv venv_tf
call venv_tf\Scripts\activate.bat
call pip install -r requirements.txt

echo Setup complete!
pause
```

**Linux/Mac (`setup-forecast.sh`):**
```bash
#!/bin/bash
echo "Installing Node.js dependencies..."
npm install

echo "Generating Prisma client..."
npm run prisma:generate

echo "Pushing database schema..."
npx prisma db push

echo "Setting up Python environment..."
python3 -m venv venv_tf
source venv_tf/bin/activate
pip install -r requirements.txt

echo "Setup complete!"
```

## Summary

After pulling the code, your teammate needs to run:

1. ✅ `npm install` - Install Node.js dependencies
2. ✅ `npm run prisma:generate` - Generate Prisma client
3. ✅ `npx prisma db push` - Update database schema
4. ✅ Create/activate Python venv and install packages
5. ✅ Start backend: `npm run start:dev`

That's it! The forecast feature should now work. 🚀

