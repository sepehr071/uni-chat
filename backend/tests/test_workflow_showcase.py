"""Showcase node types raise NotImplementedError when executed (v1: UI-only).

execute_node short-circuits showcase types BEFORE any Flask / DB access, so
these tests can run without the `app` fixture.
"""

import pytest

from app.services.workflow_service import SHOWCASE_NODE_TYPES, WorkflowService


SHOWCASE_TYPES = [
    # Marketing
    'personaBuilderNode',
    'seoBriefNode',
    'hashtagPackNode',
    'audienceMatchNode',
    # Dev
    'apiCallNode',
    'jsonTransformNode',
    'codeRunnerNode',
    'gitActionNode',
    # Automation
    'webhookTriggerNode',
    'cronScheduleNode',
    'branchConditionNode',
    'httpRequestNode',
]


def test_showcase_set_matches_expected():
    assert SHOWCASE_NODE_TYPES == frozenset(SHOWCASE_TYPES)
    assert len(SHOWCASE_NODE_TYPES) == 12


@pytest.mark.parametrize('node_type', SHOWCASE_TYPES)
def test_showcase_node_raises_not_implemented(node_type):
    node = {
        'id': f'node-{node_type}',
        'type': node_type,
        'data': {'label': f'Demo {node_type}'},
    }
    with pytest.raises(NotImplementedError) as exc_info:
        WorkflowService.execute_node(node, [], 'user123')
    msg = str(exc_info.value)
    assert 'workflow.showcaseNodeNotImplemented' in msg
    assert f'Demo {node_type}' in msg


@pytest.mark.parametrize('node_type', SHOWCASE_TYPES)
def test_showcase_node_falls_back_to_type_when_no_label(node_type):
    node = {'id': 'n1', 'type': node_type, 'data': {}}
    with pytest.raises(NotImplementedError) as exc_info:
        WorkflowService.execute_node(node, [], 'user123')
    assert node_type in str(exc_info.value)


def test_unknown_non_showcase_type_still_raises_value_error():
    node = {'id': 'n1', 'type': 'totallyMadeUpNode', 'data': {}}
    with pytest.raises(ValueError) as exc_info:
        WorkflowService.execute_node(node, [], 'user123')
    assert 'Unknown node type' in str(exc_info.value)
