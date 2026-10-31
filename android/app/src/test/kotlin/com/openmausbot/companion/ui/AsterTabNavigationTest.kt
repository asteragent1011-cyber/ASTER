package com.openmausbot.companion.ui

import com.openmausbot.companion.core.ChatTarget
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import org.junit.Test

/** The bottom tab bar on the hand-rolled stack: places, Back, Home and restarts. */
class AsterTabNavigationTest {
    private val koda = Destination.Chat(ChatTarget.Bot("koda", "t-koda"))
    private val vega = Destination.Chat(ChatTarget.Bot("vega", "t-vega"))
    private val room = Destination.Chat(ChatTarget.Room("room", "t-room"))
    private val Destination.Chat.onHome get() = copy(home = true)

    @Test
    fun `each tab is one place above the roster, so Back still lands on Chats`() {
        val navigator = CompanionNavigator()
        navigator.showTab(AsterTab.SETTINGS) { null }
        assertEquals(listOf(Destination.Roster, Destination.Settings), navigator.stack)
        navigator.showTab(AsterTab.APPS) { null }
        assertEquals(listOf(Destination.Roster, Destination.ConnectedApps), navigator.stack)
        navigator.showTab(AsterTab.ROUTINES) { null }
        assertEquals(listOf(Destination.Roster, Destination.Routines), navigator.stack)
        navigator.pop()
        assertEquals(listOf(Destination.Roster), navigator.stack)
        navigator.showTab(AsterTab.CHATS) { null }
        assertEquals(listOf(Destination.Roster), navigator.stack)
    }

    @Test
    fun `Home opens the last bot conversation, else the fallback, never a room`() {
        val navigator = CompanionNavigator()
        navigator.showTab(AsterTab.HOME) { vega }
        assertEquals(listOf(Destination.Roster, vega.onHome), navigator.stack)

        navigator.showTab(AsterTab.CHATS) { null }
        navigator.push(koda)
        navigator.push(room)
        navigator.showTab(AsterTab.SETTINGS) { null }
        navigator.showTab(AsterTab.HOME) { vega }
        assertEquals(listOf(Destination.Roster, koda.onHome), navigator.stack)
    }

    @Test
    fun `Home with no bot at all stays on the roster`() {
        val navigator = CompanionNavigator()
        navigator.showTab(AsterTab.HOME) { null }
        assertEquals(listOf(Destination.Roster), navigator.stack)
        assertNull(navigator.lastBotChat)
    }

    @Test
    fun `a restored stack remembers its bot conversation for Home`() {
        val saved = CompanionNavigator.encodeWithBond(listOf(Destination.Roster, koda, Destination.Computer("koda")), 3)
        val restored = CompanionNavigator.restoreForGeneration(saved, 3)!!
        assertEquals(koda, restored.lastBotChat)
        restored.showTab(AsterTab.HOME) { vega }
        assertEquals(listOf(Destination.Roster, koda.onHome), restored.stack)
    }

    @Test
    fun `the bar shows on Home and the four top-level screens and nowhere else`() {
        assertEquals(AsterTab.HOME, koda.onHome.asterTab())
        assertEquals(AsterTab.CHATS, Destination.Roster.asterTab())
        assertEquals(AsterTab.ROUTINES, Destination.Routines.asterTab())
        assertEquals(AsterTab.APPS, Destination.ConnectedApps.asterTab())
        assertEquals(AsterTab.SETTINGS, Destination.Settings.asterTab())
        assertNull(koda.asterTab())
        assertNull(Destination.Computer("koda").asterTab())
        assertNull(Destination.Overview("koda").asterTab())
        assertTrue(AsterTab.entries.map { it.label } == listOf("Home", "Chats", "Routines", "Apps", "Settings"))
    }

    @Test
    fun `a fresh launch opens on Home once the fleet names a bot`() {
        val navigator = CompanionNavigator(opensHome = true)
        // the fleet has not arrived: still on the roster, still waiting
        assertFalse(navigator.settleLaunchHome { null })
        assertEquals(listOf(Destination.Roster), navigator.stack)
        assertTrue(navigator.settleLaunchHome { vega })
        assertEquals(listOf(Destination.Roster, vega.onHome), navigator.stack)
        assertEquals(AsterTab.HOME, navigator.current.asterTab())
        assertEquals(vega, navigator.lastBotChat)
        // once only: Back to Chats stays on Chats
        navigator.pop()
        assertTrue(navigator.settleLaunchHome { vega })
        assertEquals(listOf(Destination.Roster), navigator.stack)
    }

    @Test
    fun `a notification tap or the reader's own choice wins over the launch Home`() {
        val tapped = CompanionNavigator(opensHome = true)
        tapped.openThread("t-room")
        assertTrue(tapped.settleLaunchHome { vega })
        assertEquals(listOf(Destination.Roster, Destination.Thread("t-room")), tapped.stack)

        val chose = CompanionNavigator(opensHome = true)
        chose.showTab(AsterTab.CHATS) { null }
        assertTrue(chose.settleLaunchHome { vega })
        assertEquals(listOf(Destination.Roster), chose.stack)
    }

    @Test
    fun `a restored stack is never moved to Home`() {
        val saved = CompanionNavigator.encodeWithBond(listOf(Destination.Roster), 1)
        val restored = CompanionNavigator.restoreForGeneration(saved, 1)!!
        assertTrue(restored.settleLaunchHome { vega })
        assertEquals(listOf(Destination.Roster), restored.stack)
    }

    // Regression: Home pushed an ordinary chat, which hides the bar, so the
    // only tabbed screen a reader ever saw was the roster — Home looked like
    // Threads, and the companion home was never a place of its own.
    @Test
    fun `Home is a tab of its own, not a chat pushed over the roster`() {
        val navigator = CompanionNavigator()
        navigator.showTab(AsterTab.HOME) { vega }
        assertEquals(AsterTab.HOME, navigator.current.asterTab())
        // a conversation opened from the roster still covers the bar
        navigator.showTab(AsterTab.CHATS) { null }
        navigator.push(vega)
        assertNull(navigator.current.asterTab())
        // and Home returns to it as Home
        navigator.showTab(AsterTab.HOME) { koda }
        assertEquals(listOf(Destination.Roster, vega.onHome), navigator.stack)
        assertEquals(vega, navigator.lastBotChat)
    }

    @Test
    fun `choosing another task on Home stays on Home`() {
        val navigator = CompanionNavigator()
        navigator.showTab(AsterTab.HOME) { vega }
        val other = Destination.Chat(ChatTarget.Bot("vega", "t-vega-2"))
        navigator.selectTask(vega.onHome, other.target)
        assertEquals(listOf(Destination.Roster, other.onHome), navigator.stack)
    }

    @Test
    fun `a conversation opened from Home sits above it, and Back returns to Home`() {
        val navigator = CompanionNavigator()
        navigator.showTab(AsterTab.HOME) { vega }
        navigator.push(koda)
        assertNull(navigator.current.asterTab())
        navigator.pop()
        assertEquals(AsterTab.HOME, navigator.current.asterTab())
        navigator.pop()
        assertEquals(listOf(Destination.Roster), navigator.stack)
    }

    @Test
    fun `Home survives being saved and restored`() {
        val saved = CompanionNavigator.encodeWithBond(listOf(Destination.Roster, vega.onHome), 2)
        val restored = CompanionNavigator.restoreForGeneration(saved, 2)!!
        assertEquals(listOf(Destination.Roster, vega.onHome), restored.stack)
        assertEquals(AsterTab.HOME, restored.current.asterTab())
        assertEquals(vega, restored.lastBotChat)
        // an ordinary chat still restores as one
        val plain = CompanionNavigator.restoreForGeneration(
            CompanionNavigator.encodeWithBond(listOf(Destination.Roster, vega), 2), 2,
        )!!
        assertEquals(listOf(Destination.Roster, vega), plain.stack)
    }
}
