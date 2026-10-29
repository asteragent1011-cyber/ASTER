package com.openmausbot.companion.ui

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AsterLookTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `only Midnight and Daylight carry the ASTER look, as on the desktop`() {
        assertEquals(AsterLook.Midnight, AppearanceSkin.MIDNIGHT.asterLook())
        assertEquals(AsterLook.Daylight, AppearanceSkin.DAYLIGHT.asterLook())
        AppearanceSkin.entries
            .filter { it != AppearanceSkin.MIDNIGHT && it != AppearanceSkin.DAYLIGHT }
            .forEach { assertNull(it.asterLook(), it.name) }
    }

    @Test
    fun `the look follows the skin's appearance`() {
        assertEquals(AppearanceSkin.MIDNIGHT.isDark, AsterLook.Midnight.isDark)
        assertEquals(AppearanceSkin.DAYLIGHT.isDark, AsterLook.Daylight.isDark)
    }

    @Test
    fun `moods match companionMood on the desktop`() {
        assertEquals(AsterMood.IDLE, asterMood(busy = false, typing = false, streaming = false))
        assertEquals(AsterMood.LISTENING, asterMood(busy = false, typing = true, streaming = false))
        assertEquals(AsterMood.THINKING, asterMood(busy = true, typing = true, streaming = false))
        assertEquals(AsterMood.RESPONDING, asterMood(busy = true, typing = false, streaming = true))
        assertEquals(AsterMood.IDLE, asterMood(busy = false, typing = false, streaming = true))
    }

    @Test
    fun `greetings match greetingFor on the desktop`() {
        assertEquals("evening", asterGreeting(4))
        assertEquals("morning", asterGreeting(5))
        assertEquals("morning", asterGreeting(11))
        assertEquals("afternoon", asterGreeting(12))
        assertEquals("afternoon", asterGreeting(16))
        assertEquals("evening", asterGreeting(17))
    }

    @Test
    fun `the theme provides the look for an ASTER skin and none otherwise`() {
        var midnight: AsterLook? = null
        var lagoon: AsterLook? = AsterLook.Daylight
        compose.setContent {
            CompanionTheme(skin = AppearanceSkin.MIDNIGHT) { midnight = LocalAsterLook.current }
            CompanionTheme(skin = AppearanceSkin.LAGOON) { lagoon = LocalAsterLook.current }
        }
        compose.waitForIdle()
        assertNotNull(midnight)
        assertNull(lagoon)
    }

    @Test
    fun `the hero greets with the bot's name and its status`() {
        compose.setContent {
            CompanionTheme(skin = AppearanceSkin.DAYLIGHT) {
                AsterHero(name = "Jev", mood = AsterMood.THINKING, hour = 9)
            }
        }
        compose.onNodeWithTag("aster-hero").assertIsDisplayed()
        compose.onNodeWithText("GOOD MORNING,").assertIsDisplayed()
        compose.onNodeWithText("Thinking…").assertIsDisplayed()
        compose.onNodeWithText("I’m Jev", substring = true).assertIsDisplayed()
    }

    @Test
    fun `the hero draws nothing under a skin without the ASTER look`() {
        compose.setContent {
            CompositionLocalProvider(LocalAsterLook provides null) {
                AsterHero(name = "Jev", mood = AsterMood.IDLE, hour = 9)
            }
        }
        compose.onNodeWithTag("aster-hero").assertDoesNotExist()
    }
}
