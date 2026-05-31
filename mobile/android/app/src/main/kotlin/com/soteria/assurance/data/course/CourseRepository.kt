package com.soteria.assurance.data.course

import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.ktx.firestore
import com.google.firebase.firestore.ktx.toObject
import com.google.firebase.firestore.ktx.toObjects
import com.google.firebase.ktx.Firebase
import com.soteria.assurance.data.model.Course
import com.soteria.assurance.data.model.Module
import kotlinx.coroutines.tasks.await

/**
 * Reads tenant-scoped content. All paths are rooted at
 * `/tenants/{tenantId}/...` so Firestore rules enforce isolation server-side
 * (`claims.tenantId == tenantId`); this client layer is a convenience only.
 */
class CourseRepository(private val db: FirebaseFirestore = Firebase.firestore) {

    private fun courses(tenantId: String) =
        db.collection("tenants").document(tenantId).collection("courses")

    /** Published courses for the tenant, newest-relevant first by title. */
    suspend fun listPublishedCourses(tenantId: String): List<Course> =
        courses(tenantId)
            .whereEqualTo("status", "published")
            .orderBy("title", Query.Direction.ASCENDING)
            .get()
            .await()
            .toObjects()

    suspend fun getCourse(tenantId: String, courseId: String): Course? =
        courses(tenantId).document(courseId).get().await().toObject<Course>()

    suspend fun listModules(tenantId: String, courseId: String): List<Module> =
        courses(tenantId)
            .document(courseId)
            .collection("modules")
            .orderBy("order", Query.Direction.ASCENDING)
            .get()
            .await()
            .toObjects()
}
