package com.soteria.assurance.ui.courses

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.soteria.assurance.data.course.CourseRepository
import com.soteria.assurance.data.model.Course
import com.soteria.assurance.data.model.Principal
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class CoursesUiState(
    val loading: Boolean = true,
    val courses: List<Course> = emptyList(),
    val error: String? = null,
)

class CoursesViewModel(
    private val principal: Principal,
    private val repo: CourseRepository = CourseRepository(),
) : ViewModel() {

    private val _state = MutableStateFlow(CoursesUiState())
    val state: StateFlow<CoursesUiState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        val tenantId = principal.tenantId
        if (tenantId == null) {
            _state.update { it.copy(loading = false, error = "No tenant bound to this account") }
            return
        }
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            runCatching { repo.listPublishedCourses(tenantId) }
                .onSuccess { list -> _state.update { it.copy(loading = false, courses = list) } }
                .onFailure { e ->
                    _state.update { it.copy(loading = false, error = e.message ?: "Failed to load") }
                }
        }
    }
}
