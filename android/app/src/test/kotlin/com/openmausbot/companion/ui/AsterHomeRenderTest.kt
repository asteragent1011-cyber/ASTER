package com.openmausbot.companion.ui

import android.content.Context
import androidx.activity.ComponentActivity
import android.graphics.Bitmap
import android.provider.Settings
import androidx.test.core.app.ApplicationProvider
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.height
import java.io.File
import kotlin.test.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The home hero, drawn for real: the companion must take up visible room on a
 * phone and actually put paint there, not only exist in the tree.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w411dp-h891dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class AsterHomeRenderTest {
    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun `the mascot is drawn large and visible above the words on a phone`() {
        // Animations off, as Reduce Motion: the companion holds still, so the
        // frame is deterministic and the clock can settle for the capture.
        Settings.Global.putFloat(
            ApplicationProvider.getApplicationContext<Context>().contentResolver,
            Settings.Global.ANIMATOR_DURATION_SCALE,
            0f,
        )
        compose.setContent {
            CompanionTheme(skin = AppearanceSkin.MIDNIGHT) {
                Box(Modifier.size(411.dp, 891.dp)) {
                    AsterBackdrop(asterLookOrMidnight(), Modifier.fillMaxSize())
                    // The space ChatScreen gives the hero: under the header,
                    // above the composer with its quick actions.
                    AsterHero(name = "Nimbus", mood = AsterMood.IDLE, hour = 10, modifier = Modifier.size(411.dp, 560.dp))
                }
            }
        }
        compose.waitForIdle()

        val mascot = compose.onNodeWithContentDescription("ASTER companion, idle")
        val bounds = mascot.getBoundsInRoot()
        assertTrue(bounds.height >= 160.dp, "mascot is only ${bounds.height} tall")

        // Drawn straight from the window: Robolectric has no PixelCopy frame
        // for captureToImage to wait on.
        val root = compose.activity.window.decorView
        val image = Bitmap.createBitmap(root.width, root.height, Bitmap.Config.ARGB_8888)
        compose.runOnUiThread { root.draw(android.graphics.Canvas(image)) }
        File("build/reports/aster-home").apply { mkdirs() }
            .resolve("hero-midnight.png").outputStream().use { image.compress(Bitmap.CompressFormat.PNG, 100, it) }

        // Paint inside the mascot's box must differ clearly from the backdrop
        // just above it: the body, orbit and moons are drawn.
        val density = image.width / 411f
        val top = (bounds.top.value * density).toInt()
        val bottom = (bounds.bottom.value * density).toInt()
        val left = (bounds.left.value * density).toInt()
        val right = (bounds.right.value * density).toInt()
        val center = image.getPixel((left + right) / 2, (top + bottom) / 2)
        val ground = image.getPixel((left + right) / 2, (top - 4).coerceAtLeast(0))
        assertTrue(luminance(center) - luminance(ground) > 0.15f, "mascot body is not visible against the ground")
    }

    private fun luminance(argb: Int): Float {
        val r = (argb shr 16 and 0xFF) / 255f
        val g = (argb shr 8 and 0xFF) / 255f
        val b = (argb and 0xFF) / 255f
        return 0.2126f * r + 0.7152f * g + 0.0722f * b
    }
}

@androidx.compose.runtime.Composable
private fun asterLookOrMidnight(): AsterLook = LocalAsterLook.current ?: AsterLook.Midnight
