import SwiftUI

struct CoursesView: View {
    @StateObject var viewModel: CoursesViewModel

    var body: some View {
        Group {
            if viewModel.loading {
                ProgressView()
            } else if let error = viewModel.error {
                ContentUnavailableView("Couldn't load courses", systemImage: "exclamationmark.triangle", description: Text(error))
            } else if viewModel.courses.isEmpty {
                ContentUnavailableView("No courses", systemImage: "book", description: Text("No published courses yet."))
            } else {
                List(viewModel.courses) { course in
                    NavigationLink {
                        // TODO: course detail / module player
                        Text(course.title)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(course.title).font(.headline)
                            if !course.description.isEmpty {
                                Text(course.description)
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(2)
                            }
                        }
                    }
                }
                .refreshable { viewModel.refresh() }
            }
        }
    }
}
