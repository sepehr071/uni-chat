@echo off
call conda activate uni-chat
python scripts/seed_prompt_templates.py
pause
