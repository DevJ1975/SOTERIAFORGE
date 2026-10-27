package com.soteria.assurance.data.model

/**
 * Wire shapes of the Forge API (`backend/apps/learning/serializers.py`, camelCase JSON).
 */

/** The signed-in member, as returned by `GET /api/me`. */
data class Principal(
    val id: String,
    val email: String?,
    val role: String,
    val tenantId: String?,
) {
    val isSuperadmin: Boolean get() = role == "superadmin"
}

/** A course in the member's tenant. */
data class Course(
    val id: String = "",
    val title: String = "",
    val description: String = "",
    val status: String = "draft",
    val tags: List<String> = emptyList(),
    val availableOffline: Boolean = false,
    val createdAt: String? = null,
    val updatedAt: String? = null,
)

/** A module group within a course; the content lives in its [lessons]. */
data class Module(
    val id: String = "",
    val courseId: String = "",
    val title: String = "",
    val label: String = "",
    val order: Int = 0,
    val lessons: List<Lesson> = emptyList(),
)

/** One content item in a module. */
data class Lesson(
    val id: String = "",
    val title: String = "",
    val order: Int = 0,
    val contentType: String = "video",
    val estimatedMinutes: Int? = null,
    val completed: Boolean = false,
)
