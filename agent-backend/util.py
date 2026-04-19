import os
from claude_agent_sdk import list_sessions

MODELS = {
    'opus': "claude-4-7-opus",
    'haiku': "claude-haiku-4-5-20251001",
    'sonnet': "claude-sonnet-4-6",
}

TOOLS = {
    'permitted': ["Read", "Bash"],
    'prohibited': ["Write", "Delete", "Rename", "Move"],
    'ask': []
}
