# Firestore models are deserialized via reflection — keep their fields.
-keepclassmembers class com.soteria.assurance.data.model.** {
  <init>();
  <fields>;
}
