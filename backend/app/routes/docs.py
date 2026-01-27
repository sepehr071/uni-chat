"""
API Documentation routes for Swagger UI
"""
import os
from flask import Blueprint, send_file, current_app

docs_bp = Blueprint('docs', __name__)

# Path to swagger directory
SWAGGER_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'swagger')


@docs_bp.route('/openapi.yaml')
def serve_openapi_spec():
    """Serve the OpenAPI specification file"""
    spec_path = os.path.join(SWAGGER_DIR, 'openapi.yaml')
    return send_file(spec_path, mimetype='text/yaml')


@docs_bp.route('/openapi.json')
def serve_openapi_json():
    """Serve the OpenAPI specification as JSON (converted from YAML)"""
    import yaml
    import json

    spec_path = os.path.join(SWAGGER_DIR, 'openapi.yaml')
    with open(spec_path, 'r', encoding='utf-8') as f:
        spec = yaml.safe_load(f)

    return current_app.response_class(
        response=json.dumps(spec, indent=2),
        status=200,
        mimetype='application/json'
    )
