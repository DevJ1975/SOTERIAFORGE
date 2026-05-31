package com.soteria.assurance.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Brand = Color(0xFF1F4E5F)
private val BrandAccent = Color(0xFF3DA5A5)

private val LightColors = lightColorScheme(primary = Brand, secondary = BrandAccent)
private val DarkColors = darkColorScheme(primary = BrandAccent, secondary = Brand)

@Composable
fun SoteriaTheme(useDark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (useDark) DarkColors else LightColors,
        content = content,
    )
}
