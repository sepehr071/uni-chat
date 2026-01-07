from datetime import datetime
from bson import ObjectId
import re


def serialize_doc(doc):
    """Convert MongoDB document to JSON serializable dict"""
    if doc is None:
        return None
    if isinstance(doc, list):
        return [serialize_doc(d) for d in doc]
    if isinstance(doc, dict):
        result = {}
        for key, value in doc.items():
            if isinstance(value, ObjectId):
                result[key] = str(value)
            elif isinstance(value, datetime):
                result[key] = value.isoformat()
            elif isinstance(value, dict):
                result[key] = serialize_doc(value)
            elif isinstance(value, list):
                result[key] = serialize_doc(value)
            else:
                result[key] = value
        return result
    if isinstance(doc, ObjectId):
        return str(doc)
    if isinstance(doc, datetime):
        return doc.isoformat()
    return doc


def generate_conversation_title(first_message, max_length=50):
    """Generate a title from the first message"""
    # Remove extra whitespace and newlines
    title = ' '.join(first_message.split())

    # Truncate if too long
    if len(title) > max_length:
        title = title[:max_length-3] + '...'

    return title if title else 'New conversation'


def validate_object_id(id_string):
    """Validate if string is a valid ObjectId"""
    try:
        ObjectId(id_string)
        return True
    except Exception:
        return False


def get_current_timestamp():
    """Get current UTC timestamp"""
    return datetime.utcnow()


def sanitize_html(text):
    """Basic HTML sanitization - remove script tags"""
    if not text:
        return text
    # Remove script tags
    text = re.sub(r'<script[^>]*>.*?</script>', '', text, flags=re.DOTALL | re.IGNORECASE)
    return text
