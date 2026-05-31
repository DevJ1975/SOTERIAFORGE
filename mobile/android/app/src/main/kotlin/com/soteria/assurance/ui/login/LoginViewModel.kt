package com.soteria.assurance.ui.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.soteria.assurance.data.auth.AuthRepository
import com.soteria.assurance.data.model.Principal
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
    val tenantId: String = "",
    val email: String = "",
    val password: String = "",
    val loading: Boolean = false,
    val error: String? = null,
)

class LoginViewModel(
    private val auth: AuthRepository = AuthRepository(),
    private val onSignedIn: (Principal) -> Unit,
) : ViewModel() {

    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    fun onTenant(v: String) = _state.update { it.copy(tenantId = v) }
    fun onEmail(v: String) = _state.update { it.copy(email = v) }
    fun onPassword(v: String) = _state.update { it.copy(password = v) }

    fun submit() {
        val s = _state.value
        if (s.email.isBlank() || s.password.isBlank()) {
            _state.update { it.copy(error = "Email and password are required") }
            return
        }
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            runCatching {
                auth.signIn(s.email, s.password, s.tenantId.ifBlank { null })
            }.onSuccess { principal ->
                _state.update { it.copy(loading = false) }
                onSignedIn(principal)
            }.onFailure { e ->
                _state.update { it.copy(loading = false, error = e.message ?: "Sign-in failed") }
            }
        }
    }
}
