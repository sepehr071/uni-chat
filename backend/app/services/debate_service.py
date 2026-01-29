"""
Debate Service

Handles building context and prompts for debate participants.
"""

from typing import List, Dict, Optional


class DebateService:
    """Service for debate context and prompt building"""

    # Marker that debaters use to signal they're done in infinite mode
    DEBATE_CONCLUDED_MARKER = '[DEBATE_CONCLUDED]'

    # Language matching instruction for multilingual debates
    LANGUAGE_INSTRUCTION = """
LANGUAGE REQUIREMENT:
You MUST respond in the same language as the debate topic.
- If the topic is in Persian/Farsi, respond entirely in Persian using Persian script
- If the topic is in Arabic, respond entirely in Arabic using Arabic script
- If the topic is in English, respond in English
- If the topic is in any other language, respond in that same language
- Match the language and script of the topic exactly
- Do NOT translate the topic or switch languages mid-response
"""

    @staticmethod
    def get_infinite_mode_instruction() -> str:
        """Get the instruction text for infinite mode debates."""
        return """
IMPORTANT - INFINITE DEBATE MODE GUIDELINES:

Your goal is thorough, substantive debate. Before considering conclusion:

1. EXPLORE THOROUGHLY:
   - Examine the topic from ethical, practical, economic, social, and philosophical angles
   - Consider edge cases and exceptions to general arguments
   - Address both short-term and long-term implications

2. ENGAGE ACTIVELY:
   - Ask probing questions to challenge other debaters' positions
   - Request evidence or clarification for claims made
   - Build upon or refute specific points from previous responses

3. CHALLENGE AND DEFEND:
   - Play devil's advocate even on points you might agree with
   - Anticipate and address potential counterarguments to your position
   - Acknowledge valid points from opponents while explaining why your position holds

4. MINIMUM ENGAGEMENT:
   - Ensure you have addressed ALL major arguments from other debaters
   - Verify you have explored at least 3-4 distinct aspects of the topic
   - Confirm no significant counterarguments remain unaddressed

CONCLUSION CRITERIA:
Only end your response with [DEBATE_CONCLUDED] when ALL of these are true:
- The core arguments have been fully explored from multiple perspectives
- You have engaged substantively with every other debater's main points
- No significant questions or challenges remain unaddressed
- You genuinely have no new insights, questions, or perspectives to offer
- The discussion has reached genuine intellectual closure, not just repetition

If ANY meaningful avenue remains unexplored, continue the debate.
"""

    @staticmethod
    def get_thinking_type_instruction(thinking_type: str) -> str:
        """Get the instruction text based on thinking type."""
        if thinking_type == 'logical':
            return """
DEBATE APPROACH - LOGICAL/ANALYTICAL:
- Focus on facts, data, statistics, and empirical evidence
- Use logical reasoning, cause-and-effect analysis
- Cite numbers, studies, and measurable outcomes when possible
- Avoid emotional appeals; prioritize rational arguments
- Structure arguments with clear premises and conclusions
- Challenge claims that lack factual support
"""
        elif thinking_type == 'feeling':
            return """
DEBATE APPROACH - EMOTIONAL/VALUES-BASED:
- Consider human impact, emotions, and lived experiences
- Appeal to values, ethics, and moral principles
- Use stories, examples, and relatable scenarios
- Acknowledge feelings and subjective experiences
- Focus on what feels right, fair, and just
- Consider cultural and personal perspectives
"""
        return ""  # balanced = no modifier

    @staticmethod
    def get_response_length_instruction(response_length: str) -> str:
        """Get the instruction text for response length."""
        if response_length == 'short':
            return "\nRESPONSE LENGTH: Keep responses concise (2-3 paragraphs max). Be direct, punchy, and get to the point quickly."
        elif response_length == 'long':
            return "\nRESPONSE LENGTH: Provide thorough, detailed responses. Explore nuances, elaborate on arguments, and give comprehensive analysis."
        return "\nRESPONSE LENGTH: Use balanced, moderate-length responses. Be thorough but focused."

    @staticmethod
    def check_debate_concluded(content: str) -> bool:
        """Check if a debater's response contains the concluded marker."""
        return DebateService.DEBATE_CONCLUDED_MARKER in content

    @staticmethod
    def strip_concluded_marker(content: str) -> str:
        """Remove the concluded marker from content for display."""
        return content.replace(DebateService.DEBATE_CONCLUDED_MARKER, '').strip()

    @staticmethod
    def build_debater_context(topic: str, previous_messages: List[Dict],
                              speaker_config: Dict, speaker_name: str,
                              is_infinite: bool = False,
                              thinking_type: str = 'balanced',
                              response_length: str = 'balanced') -> str:
        """
        Build the context/system prompt for a debater including previous messages.

        Args:
            topic: The debate topic
            previous_messages: All previous messages in the debate
            speaker_config: The config of the current speaker
            speaker_name: Display name of the current speaker
            is_infinite: Whether this is an infinite mode debate
            thinking_type: 'logical', 'feeling', or 'balanced'
            response_length: 'short', 'balanced', or 'long'

        Returns:
            System prompt for the debater
        """
        base_prompt = speaker_config.get('system_prompt', '')
        infinite_instruction = DebateService.get_infinite_mode_instruction() if is_infinite else ""
        thinking_instruction = DebateService.get_thinking_type_instruction(thinking_type)
        length_instruction = DebateService.get_response_length_instruction(response_length)

        # Build conversation history
        history_parts = []
        for msg in previous_messages:
            speaker = msg.get('speaker_name', 'Unknown')
            content = msg.get('content', '')
            history_parts.append(f"[{speaker}]: {content}")

        history_text = "\n\n".join(history_parts) if history_parts else "(No previous messages)"

        system_prompt = f"""You are participating in a structured debate on the following topic:

TOPIC: {topic}

You are "{speaker_name}" - present your perspective on this topic.

{f"Your base personality/style: {base_prompt}" if base_prompt else ""}
{thinking_instruction}
DEBATE RULES:
1. Stay on topic and engage with the arguments made by other participants
2. Be respectful but assertive in your position
3. Provide evidence and reasoning for your claims
4. Respond to counter-arguments from other debaters
5. Keep your response focused and substantive
{length_instruction}
{DebateService.LANGUAGE_INSTRUCTION}
{infinite_instruction}
CONVERSATION SO FAR:
{history_text}

Now provide your argument or response. Be direct and engage with the discussion."""

        return system_prompt

    @staticmethod
    def build_debater_user_prompt(round_num: int, total_rounds: int,
                                  is_first_in_round: bool) -> str:
        """
        Build the user prompt for a debater turn.

        Args:
            round_num: Current round number
            total_rounds: Total number of rounds (0 for infinite)
            is_first_in_round: Whether this is the first speaker in the round

        Returns:
            User prompt for the debater
        """
        is_infinite = total_rounds == 0

        if is_infinite:
            # Infinite mode prompts
            if round_num == 1 and is_first_in_round:
                return f"Round {round_num} (Infinite Mode): Present your opening argument on the topic."
            else:
                return f"Round {round_num} (Infinite Mode): Respond to the previous arguments and continue the debate. Signal [DEBATE_CONCLUDED] when you have nothing new to add."
        else:
            # Fixed rounds prompts
            if round_num == 1 and is_first_in_round:
                return f"Round {round_num} of {total_rounds}: Present your opening argument on the topic."
            elif round_num == total_rounds:
                return f"Round {round_num} of {total_rounds} (Final Round): Present your closing argument. Summarize your key points and make your final case."
            else:
                return f"Round {round_num} of {total_rounds}: Respond to the previous arguments and continue the debate."

    @staticmethod
    def build_judge_prompt(topic: str, all_messages: List[Dict],
                           debater_names: List[str]) -> str:
        """
        Build the system prompt for the judge to synthesize the debate.

        Args:
            topic: The debate topic
            all_messages: All debate messages
            debater_names: List of debater names for reference

        Returns:
            System prompt for the judge
        """
        # Build full transcript
        transcript_parts = []
        current_round = 0

        for msg in all_messages:
            msg_round = msg.get('round', 0)
            if msg_round != current_round:
                current_round = msg_round
                transcript_parts.append(f"\n--- ROUND {current_round} ---\n")

            speaker = msg.get('speaker_name', 'Unknown')
            content = msg.get('content', '')
            transcript_parts.append(f"[{speaker}]:\n{content}\n")

        transcript = "\n".join(transcript_parts)

        system_prompt = f"""You are the judge of a structured debate. Your role is to:
1. Analyze all arguments presented by each debater
2. Evaluate the strength of their reasoning and evidence
3. Consider how well they engaged with counter-arguments
4. Provide a fair and balanced synthesis of the debate

DEBATE TOPIC: {topic}

PARTICIPANTS: {', '.join(debater_names)}
{DebateService.LANGUAGE_INSTRUCTION}
FULL DEBATE TRANSCRIPT:
{transcript}

YOUR TASK:
Provide a comprehensive verdict that includes:
1. A brief summary of each participant's main arguments
2. Analysis of the strongest and weakest points made
3. How well each debater responded to challenges
4. Your overall assessment of the debate
5. If applicable, identify which arguments were most compelling

Be fair, thorough, and constructive in your analysis. Do not simply pick a "winner" unless the difference is clear - focus on the quality of discourse and ideas presented."""

        return system_prompt

    @staticmethod
    def build_judge_user_prompt() -> str:
        """
        Build the user prompt for the judge.

        Returns:
            User prompt for the judge
        """
        return "Please provide your verdict and synthesis of this debate."

    @staticmethod
    def format_messages_for_context(messages: List[Dict],
                                    config_names: Dict[str, str]) -> List[Dict]:
        """
        Format debate messages with speaker names for context building.

        Args:
            messages: Raw message documents from database
            config_names: Mapping of config_id to display name

        Returns:
            Messages with speaker_name added
        """
        formatted = []
        for msg in messages:
            config_id = str(msg.get('config_id', ''))
            speaker_name = config_names.get(config_id, 'Unknown')
            formatted.append({
                'round': msg.get('round', 0),
                'speaker_name': speaker_name,
                'content': msg.get('content', ''),
                'role': msg.get('role', 'debater')
            })
        return formatted
