# bot package marker
#
# Load bot/.env into os.environ at the earliest possible moment, BEFORE any
# `app.*` import. Backend's Config class reads os.environ at class-definition
# time (`OPENROUTER_API_KEY = os.environ.get(...)`), so any app.* import that
# happens before this dotenv call would lock in an empty key.
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / '.env', override=True)
