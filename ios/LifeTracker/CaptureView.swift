import SwiftUI
import PhotosUI

/// Share a photo from camera or library to the server. Date is auto-filled,
/// description optional, current location attached if available.
struct CaptureView: View {
    @EnvironmentObject var api: API
    @EnvironmentObject var location: LocationTracker

    @State private var pickedItem: PhotosPickerItem?
    @State private var imageData: Data?
    @State private var uiImage: UIImage?
    @State private var caption = ""
    @State private var showCamera = false
    @State private var sending = false
    @State private var sentAt: Date?

    private var nowStamp: String {
        let f = DateFormatter(); f.dateFormat = "EEEE, MMM d · HH:mm"
        return f.string(from: Date())
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("DATE — PREFILLED AUTOMATICALLY")
                        .font(Theme.mono(10)).kerning(1.8).foregroundStyle(Theme.muted)
                    Text(nowStamp).font(Theme.serif(26)).foregroundStyle(Theme.ink)

                    if let img = uiImage {
                        Image(uiImage: img)
                            .resizable().scaledToFit()
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.border))
                    } else {
                        RoundedRectangle(cornerRadius: 8)
                            .strokeBorder(Theme.border, style: .init(lineWidth: 1, dash: [6]))
                            .frame(height: 220)
                            .overlay(Text("no photo yet").font(Theme.mono(12)).foregroundStyle(Theme.muted))
                    }

                    HStack(spacing: 10) {
                        Button { showCamera = true } label: {
                            Label("Camera", systemImage: "camera").frame(maxWidth: .infinity)
                        }.buttonStyle(TrackerButton())
                        PhotosPicker(selection: $pickedItem, matching: .images) {
                            Label("Library", systemImage: "photo").frame(maxWidth: .infinity)
                        }.buttonStyle(TrackerButton())
                    }

                    TextField("Description (optional)", text: $caption, axis: .vertical)
                        .lineLimit(2...4)
                        .font(Theme.mono(14))
                        .padding(12)
                        .background(Theme.card, in: RoundedRectangle(cornerRadius: 6))
                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(Theme.border))

                    Button {
                        guard let data = imageData else { return }
                        sending = true
                        api.upload(kind: "photo", ext: "jpg", data: data, caption: caption,
                                   coordinate: location.currentCoordinate) { ok in
                            sending = false
                            if ok { sentAt = Date(); uiImage = nil; imageData = nil; caption = "" }
                        }
                    } label: {
                        Text(sending ? "SENDING…" : "APPEND TO THE LOG →")
                            .font(Theme.mono(12)).kerning(1.5)
                            .frame(maxWidth: .infinity).padding(.vertical, 14)
                    }
                    .background(imageData == nil ? Theme.border : Theme.gold,
                                in: RoundedRectangle(cornerRadius: 6))
                    .foregroundStyle(imageData == nil ? Theme.muted : Theme.bg)
                    .disabled(imageData == nil || sending)

                    if let t = sentAt {
                        Text("appended ✓ \(t.formatted(date: .omitted, time: .shortened))")
                            .font(Theme.mono(12)).foregroundStyle(.green)
                    }
                    if let err = api.lastError {
                        Text(err).font(Theme.mono(11)).foregroundStyle(.red)
                    }
                }
                .padding(20)
            }
            .background(Theme.bg)
            .navigationTitle("Capture")
        }
        .onChange(of: pickedItem) { _, item in
            Task {
                if let data = try? await item?.loadTransferable(type: Data.self),
                   let img = UIImage(data: data) {
                    setImage(img)
                }
            }
        }
        .sheet(isPresented: $showCamera) {
            CameraPicker { img in setImage(img) }
                .ignoresSafeArea()
        }
    }

    private func setImage(_ img: UIImage) {
        uiImage = img
        imageData = img.jpegData(compressionQuality: 0.8)
    }
}

struct TrackerButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Theme.mono(13))
            .padding(.vertical, 12)
            .foregroundStyle(Theme.gold)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(Theme.border))
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

/// UIKit camera bridge.
struct CameraPicker: UIViewControllerRepresentable {
    let onImage: (UIImage) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let p = UIImagePickerController()
        p.sourceType = .camera
        p.delegate = context.coordinator
        return p
    }
    func updateUIViewController(_ vc: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(onImage: onImage) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onImage: (UIImage) -> Void
        init(onImage: @escaping (UIImage) -> Void) { self.onImage = onImage }
        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let img = info[.originalImage] as? UIImage { onImage(img) }
            picker.dismiss(animated: true)
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { picker.dismiss(animated: true) }
    }
}
