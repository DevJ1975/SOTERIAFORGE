package com.soteria.assurance

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.soteria.assurance.data.model.Principal
import com.soteria.assurance.ui.courses.CoursesScreen
import com.soteria.assurance.ui.courses.CoursesViewModel
import com.soteria.assurance.ui.login.LoginScreen
import com.soteria.assurance.ui.login.LoginViewModel
import com.soteria.assurance.ui.theme.SoteriaTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { SoteriaTheme { AppRoot() } }
    }
}

/**
 * Minimal top-level state machine: unauthenticated -> Login, authenticated ->
 * Courses. A larger app would lift this into a NavHost + DI graph.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AppRoot() {
    var principal by remember { mutableStateOf<Principal?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text(if (principal == null) "Sign in" else "My courses") })
        },
    ) { padding ->
        val current = principal
        if (current == null) {
            val vm = remember { LoginViewModel(onSignedIn = { principal = it }) }
            LoginScreen(vm, Modifier.padding(padding))
        } else {
            val vm = remember(current.uid) { CoursesViewModel(principal = current) }
            CoursesScreen(
                vm = vm,
                onOpenCourse = { /* TODO: navigate to course detail / module player */ },
                modifier = Modifier.padding(padding),
            )
        }
    }
}
