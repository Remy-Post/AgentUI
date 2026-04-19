import asyncio
import os
from dotenv import load_dotenv
from claude_agent_sdk import ClaudeAgent, ClaudeAgentOptions, HookMatcher, tool
from util import TOOLS, MODELS

load_dotenv()



# Tools Protection
def protect_sensitive_files(input_data: dict, tool_use_id: str, context):
        # Extract the file path from the tool's input arguments
    file_path = input_data["tool_input"].get("path", "")
    file_name = file_path.split("/")[-1]

    # Block the operation if targeting a .env file
    if file_name == ".env":
        return {
            "hookSpecificOutput": {
                "hookEventName": input_data["hook_event_name"],
                "permissionDecision": "deny",
                "permissionDecisionReason": "Cannot modify .env files",
            }
        }

    # Return empty object to allow the operation
    return {}


@tool("Read", "Read the contents of a file", parameters={"path": "The path to the file to read"})
def read(path: str):
    return os.read(path, 1024)
    
async def main():
    options = ClaudeAgentOptions(
        hooks={
            "PreToolUse": [HookMatcher(matcher="Write|Edit|Read", hooks=[protect_sensitive_files])]

        }
    )


    async with ClaudeSDKClient(options=options) as client:
        await client.query("Update the database configuration")
        async for message in client.receive_response():
            # Filter for assistant and result messages
            if isinstance(message, (AssistantMessage, ResultMessage)):
                print(message)

if __name__ == "__main__":
    asyncio.run(main())