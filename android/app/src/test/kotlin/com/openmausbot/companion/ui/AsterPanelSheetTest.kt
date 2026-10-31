package com.openmausbot.companion.ui

import androidx.activity.ComponentActivity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import kotlin.test.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** The phone's ASTER panel: Aster Mode as a radio group, Growth as a stepper, in every skin. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h780dp")
class AsterPanelSheetTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun `choosing a mode selects it and reports it`() {
        var saved: AsterMode? = null
        compose.setContent {
            CompanionTheme(skin = AppearanceSkin.MIDNIGHT) {
                var mode by remember { mutableStateOf(AsterMode.BALANCED) }
                AsterPanelContent(botName = "Nimbus", stage = GrowthStage.LEARNING, mode = mode, onSelectMode = {
                    mode = it
                    saved = it
                })
            }
        }
        compose.onNodeWithText("Balanced").assertIsSelected()
        compose.onNodeWithText("Technical").assertIsNotSelected().performClick()
        compose.waitForIdle()
        assertEquals(AsterMode.TECHNICAL, saved)
        compose.onNodeWithText("Technical").assertIsSelected()
        compose.onNodeWithText("Balanced").assertIsNotSelected()
        compose.onNodeWithText("Saved with this conversation. Applies to the bot's next reply.").assertExists()
    }

    @Test
    fun `growth says the current stage and draws all five`() {
        compose.setContent {
            CompanionTheme(skin = AppearanceSkin.DAYLIGHT) {
                AsterPanelContent(botName = "Nimbus", stage = GrowthStage.WORKING, mode = AsterMode.STUDY, onSelectMode = {})
            }
        }
        compose.onNodeWithContentDescription("Growth: Working, stage 4 of 5").assertExists()
        compose.onNodeWithText("Where this conversation with Nimbus stands").assertExists()
    }

    @Test
    fun `the panel renders in every skin, the six fallbacks and both ASTER looks`() {
        var skin by mutableStateOf(AppearanceSkin.MIDNIGHT)
        compose.setContent {
            CompanionTheme(skin = skin) {
                AsterPanelContent(botName = "Nimbus", stage = GrowthStage.ACHIEVED, mode = AsterMode.RELAXED, onSelectMode = {})
            }
        }
        for (each in AppearanceSkin.entries) {
            skin = each
            compose.waitForIdle()
            compose.onNodeWithText("Aster Mode").assertExists()
            compose.onNodeWithContentDescription("Growth: Achieved, stage 5 of 5").assertExists()
        }
    }

    @Test
    fun `tapping a stage pins it, and tapping the pinned stage hands it back`() {
        val picked = mutableListOf<GrowthStage?>()
        var stage by mutableStateOf(GrowthStage.LEARNING)
        var manual by mutableStateOf(false)
        compose.setContent {
            CompanionTheme(skin = AppearanceSkin.MIDNIGHT) {
                AsterPanelContent(
                    botName = "Nimbus", stage = stage, manualStage = manual, mode = AsterMode.BALANCED, onSelectMode = {},
                    onSelectStage = { picked += it },
                )
            }
        }
        compose.onNodeWithText("Working").performClick()
        assertEquals(listOf<GrowthStage?>(GrowthStage.WORKING), picked)

        stage = GrowthStage.WORKING
        manual = true
        compose.waitForIdle()
        compose.onNodeWithText("Set by you for this conversation").assertExists()
        compose.onNodeWithContentDescription("Growth: Working, stage 4 of 5, set by you").assertExists()
        compose.onNodeWithText("Working").performClick()
        compose.onNodeWithText("Back to automatic").performClick()
        assertEquals(listOf(GrowthStage.WORKING, null, null), picked)
    }

    @Test
    fun `while it cannot save, nothing can be picked`() {
        var calls = 0
        compose.setContent {
            CompanionTheme(skin = AppearanceSkin.MIDNIGHT) {
                AsterPanelContent(
                    botName = "Nimbus", stage = GrowthStage.CURIOUS, mode = AsterMode.BALANCED, enabled = false,
                    onSelectMode = { calls++ }, onSelectStage = { calls++ },
                )
            }
        }
        compose.onNodeWithText("Creative").assertIsNotEnabled().performClick()
        compose.onNodeWithText("Planning").assertIsNotEnabled().performClick()
        assertEquals(0, calls)
    }
}
