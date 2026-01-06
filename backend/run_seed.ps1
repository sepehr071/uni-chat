# Initialize Conda for PowerShell
& "C:\Users\sepito\anaconda3\shell\condabin\conda-hook.ps1"

# Activate the environment
conda activate uni-chat

# Run the seed script
python scripts\seed_prompt_templates.py

# Keep window open
Read-Host "Press Enter to exit"
