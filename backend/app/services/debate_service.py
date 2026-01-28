"""
Debate Service

Handles building context and prompts for debate participants.
"""

from typing import List, Dict, Optional


class DebateService:
    """Service for debate context and prompt building"""

    # Marker that debaters use to signal they're done in infinite mode
    DEBATE_CONCLUDED_MARKER = '[DEBATE_CONCLUDED]'

    @staticmethod
    def get_infinite_mode_instruction() -> str:
        """Get the instruction text for infinite mode debates."""
        return """
IMPORTANT - INFINITE DEBATE MODE:
If you feel the debate has reached its natural conclusion and you have nothing
substantially new to add, end your response with exactly: [DEBATE_CONCLUDED]

Only use this marker when you genuinely believe the discussion is complete and
you have no new arguments, counterpoints, or perspectives to offer. Continue
debating if there are still points to address or counterarguments to make.
"""

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
                              is_infinite: bool = False) -> str:
        """
        Build the context/system prompt for a debater including previous messages.

        Args:
            topic: The debate topic
            previous_messages: All previous messages in the debate
            speaker_config: The config of the current speaker
            speaker_name: Display name of the current speaker
            is_infinite: Whether this is an infinite mode debate

        Returns:
            System prompt for the debater
        """
        base_prompt = speaker_config.get('system_prompt', '')
        infinite_instruction = DebateService.get_infinite_mode_instruction() if is_infinite else ""

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

DEBATE RULES:
1. Stay on topic and engage with the arguments made by other participants
2. Be respectful but assertive in your position
3. Provide evidence and reasoning for your claims
4. Respond to counter-arguments from other debaters
5. Keep your response focused and substantive
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
