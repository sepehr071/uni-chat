from flask import Blueprint, jsonify
from datetime import datetime
from app.extensions import mongo

health_bp = Blueprint('health', __name__)


@health_bp.route('/', methods=['GET'])
def health_check():
    """Health check endpoint for load balancers and monitoring"""
    status = 'healthy'
    checks = {}

    # Check MongoDB connection
    try:
        mongo.db.command('ping')
        checks['database'] = 'ok'
    except Exception as e:
        checks['database'] = f'error: {str(e)}'
        status = 'unhealthy'

    return jsonify({
        'status': status,
        'timestamp': datetime.utcnow().isoformat(),
        'checks': checks
    }), 200 if status == 'healthy' else 503


@health_bp.route('/ready', methods=['GET'])
def readiness_check():
    """Readiness check for Kubernetes"""
    try:
        mongo.db.command('ping')
        return jsonify({'ready': True}), 200
    except:
        return jsonify({'ready': False}), 503


@health_bp.route('/live', methods=['GET'])
def liveness_check():
    """Liveness check for Kubernetes"""
    return jsonify({'alive': True}), 200
