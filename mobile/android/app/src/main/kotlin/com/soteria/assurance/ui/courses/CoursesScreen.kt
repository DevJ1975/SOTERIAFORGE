package com.soteria.assurance.ui.courses

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.material3.CircularProgressIndicator
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.soteria.assurance.data.model.Course

@Composable
fun CoursesScreen(
    vm: CoursesViewModel,
    onOpenCourse: (Course) -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by vm.state.collectAsStateWithLifecycle()

    Box(modifier.fillMaxSize()) {
        when {
            state.loading -> CircularProgressIndicator(Modifier.align(Alignment.Center))
            state.error != null -> Text(
                state.error!!,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.align(Alignment.Center).padding(24.dp),
            )
            state.courses.isEmpty() -> Text(
                "No published courses yet.",
                modifier = Modifier.align(Alignment.Center),
            )
            else -> LazyColumn(Modifier.fillMaxSize().padding(16.dp)) {
                items(state.courses, key = { it.id }) { course ->
                    CourseRow(course, onClick = { onOpenCourse(course) })
                }
            }
        }
    }
}

@Composable
private fun CourseRow(course: Course, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp)
            .clickable(onClick = onClick),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(course.title, style = MaterialTheme.typography.titleMedium)
            if (course.description.isNotBlank()) {
                Text(
                    course.description,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }
}
