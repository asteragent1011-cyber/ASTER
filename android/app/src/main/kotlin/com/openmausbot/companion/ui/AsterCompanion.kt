package com.openmausbot.companion.ui

import com.openmausbot.companion.core.Message

/**
 * The ASTER home's rules, ported from the desktop's `src/lib/aster-companion.ts`
 * and `Composer.tsx` so both apps agree on when a conversation is still at its
 * start and what the home offers to begin with. Pure, so it is unit-tested.
 */
object AsterCompanion {
    /**
     * The seeded opening line every new bot's thread starts with
     * (server/store.ts createBot): `Hi, I'm <name>. What would you like me to do?`
     */
    private val OPENING_GREETING = Regex("""^Hi, I'm .+\. What would you like me to do\?$""")

    /**
     * Whether a thread is still at its start, so the home hero takes the place
     * of the transcript: nothing yet, or only the bot's own opening greeting.
     * A thread holding any other bot content (a routine result, a peer's
     * message, a webhook) is a conversation and must show it, even with no
     * user turn. Never home while the bot is working.
     */
    fun isHome(busy: Boolean, messages: List<Message>): Boolean =
        !busy && messages.all { message ->
            message.role == Message.Role.BOT &&
                message.kind == Message.Kind.TEXT &&
                OPENING_GREETING.matches(message.text.orEmpty())
        }

    /**
     * The home composer's starters, the desktop's `QUICK_ACTIONS`. Each fills
     * the composer rather than sending: the prompt is the start of a sentence.
     * [attach] also opens the file picker, as "Analyze a file" does there.
     * [icon] is a [quickReplyGlyph] key, so the chips draw from the one table.
     */
    data class QuickAction(val title: String, val prompt: String, val icon: String, val attach: Boolean = false)

    val QUICK_ACTIONS: List<QuickAction> = listOf(
        QuickAction("Plan a project", "Help me plan a project: ", icon = "list"),
        QuickAction("Write code", "Help me write code that ", icon = "terminal"),
        QuickAction("Analyze a file", "Analyze the attached file and tell me what stands out.", icon = "document", attach = true),
        QuickAction("Explore ideas", "Let's explore some ideas about ", icon = "search"),
    )

    /** The quick actions as composer chips. */
    val QUICK_ACTION_CHIPS: List<PredictiveChip> =
        QUICK_ACTIONS.map { PredictiveChip(title = it.title, prompt = it.prompt, icon = it.icon) }

    /** The quick action a chip stands for, or null for one of the reader's own quick replies. */
    fun quickActionFor(chip: PredictiveChip): QuickAction? =
        QUICK_ACTIONS.firstOrNull { it.title == chip.title && it.prompt == chip.prompt }

    /**
     * The draft a quick action leaves: the prompt alone in an empty composer,
     * or appended after what is already there, as the desktop does.
     */
    fun draftAfter(action: QuickAction, current: String): String =
        if (current.isBlank()) action.prompt else "${current.trimEnd()} ${action.prompt}"

    /** The home composer's invitation, the desktop's hero placeholder. */
    const val HOME_PLACEHOLDER = "What would you like to do today?"

    /** Rows that record a turn rather than say anything: the digest and compaction receipts. */
    private fun isReceipt(message: Message): Boolean =
        message.kind == Message.Kind.DIGEST || message.kind == Message.Kind.COMPACTION

    /**
     * Where the open conversation stands, read from its messages (the desktop's
     * `growthStage`): nothing asked yet, asked and not started, thinking,
     * running tools, or answered. Receipts after a turn do not count.
     */
    fun growthStage(busy: Boolean, messages: List<Message>): GrowthStage {
        val rows = messages.filterNot(::isReceipt)
        if (rows.none { it.role == Message.Role.USER }) return GrowthStage.CURIOUS
        val last = rows.lastOrNull()
        if (busy) return if (last?.kind == Message.Kind.ACTIVITY) GrowthStage.WORKING else GrowthStage.PLANNING
        return if (last?.role == Message.Role.USER) GrowthStage.LEARNING else GrowthStage.ACHIEVED
    }

    /**
     * Where the conversation stands: the stage the person set by hand on its
     * thread ([manual], a wire value), else the automatic reading. The
     * desktop's `conversationGrowth`.
     */
    fun conversationGrowth(busy: Boolean, messages: List<Message>, manual: String?): Pair<GrowthStage, Boolean> {
        val pinned = GrowthStage.fromWire(manual)
        return if (pinned != null) pinned to true else growthStage(busy, messages) to false
    }
}

/**
 * How a person wants ASTER to help in one conversation (the desktop's
 * `AsterMode`, shared/aster-mode.ts). Saved on the conversation's thread on the
 * computer, so every device sees the same choice, and the bot's next turn
 * carries it in its system prompt.
 */
enum class AsterMode(val wireValue: String, val label: String, val hint: String) {
    BALANCED("balanced", "Balanced", "Everyday help"),
    CREATIVE("creative", "Creative", "For ideas & brainstorming"),
    TECHNICAL("technical", "Technical", "For coding & problem solving"),
    STUDY("study", "Study", "For learning & research"),
    RELAXED("relaxed", "Relaxed", "For casual conversations"),
    ;

    companion object {
        /** A stored value this build cannot read is Balanced, as on the desktop. */
        fun fromWire(value: String?): AsterMode = entries.firstOrNull { it.wireValue == value } ?: BALANCED
    }
}

/** The desktop's `GROWTH_STAGES`, in order. */
enum class GrowthStage(val label: String) {
    CURIOUS("Curious"),
    LEARNING("Learning"),
    PLANNING("Planning"),
    WORKING("Working"),
    ACHIEVED("Achieved"),
    ;

    val wireValue: String get() = name.lowercase()

    companion object {
        /** A stage this build cannot read is no stage: the automatic reading stands. */
        fun fromWire(value: String?): GrowthStage? = entries.firstOrNull { it.wireValue == value }
    }
}
