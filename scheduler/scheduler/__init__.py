# scheduler package marker
#
# CRITICAL: load scheduler/.env into os.environ at the earliest possible moment,
# BEFORE any `app.*` import. Backend's Config class reads os.environ at
# class-definition time (`OPENROUTER_API_KEY = os.environ.get(...)`), so any
# app.* import that happens before this dotenv call would lock in an empty key.
# Same gotcha as the bot package — see CLAUDE.md "Bot dotenv must load before
# any app.* import".
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / '.env', override=True)
