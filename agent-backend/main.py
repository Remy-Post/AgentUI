import asyncio
from dotenv import load_dotenv
from claude_agent_sdk import query, ClaudeAgentOptions

load_dotenv()

async def main():
    async for message in query(
        prompt="Say hello and tell me what tools you have access to.",
        options=ClaudeAgentOptions(allowed_tools=["Read", "Bash"]),
    ):
        print(message)

if __name__ == "__main__":
    asyncio.run(main())