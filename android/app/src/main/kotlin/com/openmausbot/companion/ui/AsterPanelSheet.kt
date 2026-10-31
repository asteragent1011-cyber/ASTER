package com.openmausbot.companion.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.openmausbot.companion.R

/**
 * The desktop's ASTER companion panel (`AsterContextPanel.tsx`), shaped for a
 * phone: a sheet with how ASTER should help in this conversation (Aster
 * Mode) and where it stands (Growth, read from its messages unless the person
 * set it). Both are saved on the conversation's thread on the computer. The desktop panel's search, notifications and profile shortcuts
 * already live in the phone's own header and tab bar, so they are not repeated.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AsterPanelSheet(
    botName: String,
    stage: GrowthStage,
    manualStage: Boolean,
    mode: AsterMode,
    enabled: Boolean,
    onSelectMode: (AsterMode) -> Unit,
    onSelectStage: (GrowthStage?) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        AsterPanelContent(
            botName = botName,
            stage = stage,
            manualStage = manualStage,
            mode = mode,
            enabled = enabled,
            onSelectMode = onSelectMode,
            onSelectStage = onSelectStage,
        )
    }
}

/** The sheet's body: Aster Mode, then Growth. */
@Composable
internal fun AsterPanelContent(
    botName: String,
    stage: GrowthStage,
    mode: AsterMode,
    onSelectMode: (AsterMode) -> Unit,
    modifier: Modifier = Modifier,
    manualStage: Boolean = false,
    /** False while the conversation cannot be saved to: offline, or a save is under way. */
    enabled: Boolean = true,
    onSelectStage: (GrowthStage?) -> Unit = {},
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
            .padding(bottom = 16.dp)
            .navigationBarsPadding(),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        AsterModeSection(mode = mode, enabled = enabled, onSelectMode = onSelectMode)
        GrowthSection(botName = botName, stage = stage, manual = manualStage, enabled = enabled, onSelectStage = onSelectStage)
    }
}

/** The ASTER accent: the look's violet in Midnight/Daylight, the skin's primary otherwise. */
@Composable
private fun panelAccent(): Color = LocalAsterLook.current?.violet ?: MaterialTheme.colorScheme.primary

@Composable
private fun SectionHeader(title: String, subtitle: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        AsterMark(size = 32.dp)
        Column {
            Text(
                text = title,
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.semantics { heading() },
            )
            Text(text = subtitle, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun modeIcon(mode: AsterMode): Painter = when (mode) {
    AsterMode.BALANCED -> painterResource(R.drawable.ic_sparkles)
    AsterMode.CREATIVE -> rememberVectorPainter(Icons.Filled.Edit)
    AsterMode.TECHNICAL -> rememberVectorPainter(Icons.Filled.Build)
    AsterMode.STUDY -> rememberVectorPainter(Icons.Filled.Info)
    AsterMode.RELAXED -> rememberVectorPainter(Icons.Filled.Favorite)
}

@Composable
private fun AsterModeSection(mode: AsterMode, enabled: Boolean, onSelectMode: (AsterMode) -> Unit) {
    val accent = panelAccent()
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SectionHeader(title = "Aster Mode", subtitle = "How Aster helps in this conversation")
        Column(modifier = Modifier.selectableGroup(), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            AsterMode.entries.forEach { option ->
                val selected = option == mode
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = MIN_TOUCH_TARGET + 8.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(if (selected) accent.copy(alpha = 0.14f) else Color.Transparent)
                        .selectable(selected = selected, enabled = enabled, role = Role.RadioButton, onClick = { onSelectMode(option) })
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .background(accent.copy(alpha = if (selected) 0.24f else 0.1f), CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(painter = modeIcon(option), contentDescription = null, tint = accent, modifier = Modifier.size(18.dp))
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = option.label,
                            fontSize = 15.sp,
                            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        Text(text = option.hint, fontSize = 12.5.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    RadioButton(
                        selected = selected,
                        onClick = null,
                        colors = RadioButtonDefaults.colors(selectedColor = accent),
                    )
                }
            }
        }
        // Where the choice lives: on the conversation, read by the bot's next turn.
        Text(
            text = "Saved with this conversation. Applies to the bot's next reply.",
            fontSize = 12.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 4.dp),
        )
    }
}

@Composable
private fun stageIcon(stage: GrowthStage): Painter = rememberVectorPainter(
    when (stage) {
        GrowthStage.CURIOUS -> Icons.Filled.Search
        GrowthStage.LEARNING -> Icons.Filled.Info
        GrowthStage.PLANNING -> Icons.AutoMirrored.Filled.List
        GrowthStage.WORKING -> Icons.Filled.PlayArrow
        GrowthStage.ACHIEVED -> Icons.Filled.CheckCircle
    },
)

@Composable
private fun GrowthSection(
    botName: String,
    stage: GrowthStage,
    manual: Boolean,
    enabled: Boolean,
    onSelectStage: (GrowthStage?) -> Unit,
) {
    val accent = panelAccent()
    val reached = stage.ordinal
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        SectionHeader(
            title = "Aster's Growth",
            subtitle = if (manual) "Set by you for this conversation" else "Where this conversation with $botName stands",
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .semantics {
                    contentDescription = "Growth: ${stage.label}, stage ${reached + 1} of ${GrowthStage.entries.size}" +
                        if (manual) ", set by you" else ""
                },
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            GrowthStage.entries.forEach { step ->
                val isReached = step.ordinal <= reached
                val isCurrent = step == stage
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(14.dp))
                        // picking a stage pins it; picking the pinned one again hands it back
                        .selectable(
                            selected = isCurrent,
                            enabled = enabled,
                            role = Role.Button,
                            onClick = { onSelectStage(if (manual && isCurrent) null else step) },
                        )
                        .padding(vertical = 4.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .background(
                                if (isReached) accent.copy(alpha = if (isCurrent) 0.32f else 0.16f) else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.06f),
                                CircleShape,
                            )
                            .then(if (isCurrent) Modifier.border(2.dp, accent, CircleShape) else Modifier),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            painter = stageIcon(step),
                            contentDescription = null,
                            tint = if (isReached) accent else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(20.dp),
                        )
                    }
                    Text(
                        text = step.label,
                        fontSize = 11.5.sp,
                        textAlign = TextAlign.Center,
                        fontWeight = if (isCurrent) FontWeight.SemiBold else FontWeight.Normal,
                        color = if (isCurrent) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        if (manual) {
            Text(
                text = "Back to automatic",
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                color = accent,
                modifier = Modifier
                    .align(Alignment.CenterHorizontally)
                    .clip(RoundedCornerShape(12.dp))
                    .selectable(selected = false, enabled = enabled, role = Role.Button, onClick = { onSelectStage(null) })
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            )
        }
        Spacer(Modifier.height(4.dp))
    }
}
