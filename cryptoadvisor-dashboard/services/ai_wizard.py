from services.claude_cli import ask_claude

async def get_wizard_guidance(step: str, user_input: dict) -> str:
    """Get AI guidance for a specific setup step."""
    prompts = {
        "welcome": f"You are the CryptoAdvisor setup wizard. The user just logged in for the first time. Welcome them warmly and briefly explain what this platform can do (portfolio tracking, DeFi monitoring, AI analysis, whale tracking, tax reports). Ask them about their experience level (beginner/intermediate/advanced) and what they're most interested in. Keep it conversational and under 150 words.",

        "experience": f"The user described their crypto experience as: '{user_input.get('answer', '')}'. Based on this, recommend which features they should set up first. Suggest 3-5 specific features from: wallet connection, price alerts, DCA plans, DeFi tracking, whale watching, portfolio building, tax reporting. Explain each suggestion in one sentence. Be encouraging.",

        "wallet": f"The user wants to set up wallet tracking. Their experience level: {user_input.get('level', 'beginner')}. Guide them through connecting a wallet. Explain: 1) They can connect MetaMask for live connection, 2) They can add any wallet address to watch (no private keys needed), 3) We support Ethereum, BSC, Polygon, Arbitrum, Base, Solana, Bitcoin. Suggest they start with their main wallet. Keep it simple and reassuring about security.",

        "alerts": f"Help the user set up their first price alerts. Their holdings: {user_input.get('holdings', 'unknown')}. Suggest 3 specific alerts they should create based on current market conditions. For each, explain why it's useful. Include both upside targets and downside protection. Format as clear actionable items.",

        "portfolio": f"The user wants help building a portfolio. Their experience: {user_input.get('level', 'beginner')}, interests: {user_input.get('interests', 'general crypto')}, risk tolerance: {user_input.get('risk', 'moderate')}. Suggest a specific portfolio allocation with percentages, coin names, and brief rationale. Include a mix of large-cap, mid-cap based on risk level. Add a disclaimer.",

        "complete": f"The user has completed the setup wizard. They set up: {user_input.get('completed_steps', [])}. Give them a brief congratulations, summarize what they've configured, and suggest 2-3 next things to explore. Mention the AI chat (bottom-right) is always available for questions. Keep it warm and brief."
    }

    prompt = prompts.get(step, f"The user is in setup step '{step}' and said: '{user_input.get('answer', '')}'. Help them continue the setup process for CryptoAdvisor dashboard.")
    return await ask_claude(prompt)

async def get_personalized_recommendations(experience: str, interests: list) -> str:
    """Get personalized feature recommendations based on user profile."""
    prompt = f"Based on a crypto user with experience level '{experience}' interested in {', '.join(interests)}, recommend the top 5 CryptoAdvisor features they should explore. Features available: wallet tracking, price alerts, DCA plans, DeFi position monitoring, whale tracking, NFT gallery, tax reporting, AI market briefing, AI risk assessment, portfolio backtesting, yield aggregation, token approval management, governance voting, copy trading. For each recommendation, give the feature name and a one-line explanation of why."
    return await ask_claude(prompt)
