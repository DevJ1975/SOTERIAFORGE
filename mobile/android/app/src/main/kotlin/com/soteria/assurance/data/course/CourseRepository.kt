package com.soteria.assurance.data.course

import com.soteria.assurance.data.model.Course
import com.soteria.assurance.data.model.Lesson
import com.soteria.assurance.data.model.Module
import com.soteria.assurance.data.net.ForgeApi
import org.json.JSONArray
import org.json.JSONObject

/**
 * Reads the signed-in member's content from the Forge API. The API scopes every call to
 * the member's tenant (Postgres row-level security); this client layer is a convenience only.
 */
class CourseRepository {

    /** Published courses for the tenant, ordered by title. */
    suspend fun listPublishedCourses(): List<Course> {
        val rows = ForgeApi.request("GET", "courses") as JSONArray
        return (0 until rows.length())
            .map { toCourse(rows.getJSONObject(it)) }
            .filter { it.status == "published" }
            .sortedBy { it.title.lowercase() }
    }

    /** A course's modules, each with its lessons, in order. */
    suspend fun listModules(courseId: String): List<Module> {
        val course = ForgeApi.request("GET", "courses/$courseId") as JSONObject
        val modules = course.optJSONArray("modules") ?: JSONArray()
        return (0 until modules.length()).map { toModule(modules.getJSONObject(it)) }
            .sortedBy { it.order }
    }

    private fun toCourse(json: JSONObject) = Course(
        id = json.getString("id"),
        title = json.optString("title"),
        description = json.optString("description"),
        status = json.optString("status", "draft"),
        tags = json.optJSONArray("tags").strings(),
        availableOffline = json.optBoolean("availableOffline", false),
        createdAt = json.optString("createdAt").ifBlank { null },
        updatedAt = json.optString("updatedAt").ifBlank { null },
    )

    private fun toModule(json: JSONObject): Module {
        val lessons = json.optJSONArray("lessons") ?: JSONArray()
        return Module(
            id = json.getString("id"),
            courseId = json.optString("courseId"),
            title = json.optString("title"),
            label = json.optString("label"),
            order = json.optInt("order"),
            lessons = (0 until lessons.length()).map {
                val l = lessons.getJSONObject(it)
                Lesson(
                    id = l.getString("id"),
                    title = l.optString("title"),
                    order = l.optInt("order"),
                    contentType = l.optString("contentType", "video"),
                    estimatedMinutes = if (l.isNull("estimatedMinutes")) null else l.optInt("estimatedMinutes"),
                    completed = l.optBoolean("completed", false),
                )
            }.sortedBy { it.order },
        )
    }

    private fun JSONArray?.strings(): List<String> =
        if (this == null) emptyList() else (0 until length()).map { optString(it) }
}
