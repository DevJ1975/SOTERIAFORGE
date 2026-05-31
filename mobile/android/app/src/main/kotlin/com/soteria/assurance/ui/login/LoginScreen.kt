package com.soteria.assurance.ui.login

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable
fun LoginScreen(vm: LoginViewModel, modifier: Modifier = Modifier) {
    val state by vm.state.collectAsStateWithLifecycle()

    Column(
        modifier = modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
    ) {
        Text("Soteria Assurance", style = MaterialTheme.typography.headlineMedium)

        OutlinedTextField(
            value = state.tenantId,
            onValueChange = vm::onTenant,
            label = { Text("Organization (tenant) id") },
            supportingText = { Text("Leave blank only for platform admins") },
            singleLine = true,
        )
        OutlinedTextField(
            value = state.email,
            onValueChange = vm::onEmail,
            label = { Text("Email") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            singleLine = true,
        )
        OutlinedTextField(
            value = state.password,
            onValueChange = vm::onPassword,
            label = { Text("Password") },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            singleLine = true,
        )

        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }

        Button(onClick = vm::submit, enabled = !state.loading) {
            if (state.loading) CircularProgressIndicator(Modifier.padding(end = 8.dp))
            Text("Sign in")
        }
    }
}
