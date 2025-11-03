//
//  SafariMessage.swift
//  Gemini Voyager Safari Extension
//
//  Created for Gemini Voyager
//  https://github.com/Nagi-ovo/gemini-voyager
//

import Foundation

/// Message types exchanged between JavaScript and native Swift code
enum SafariMessageAction: String, Codable {
    case ping
    case getVersion
    case syncStorage

    // Future actions can be added here:
    // case exportToFiles
    // case importFromFiles
    // case showNotification
}

/// Standard message structure from JavaScript
struct SafariMessage: Codable {
    let action: SafariMessageAction
    let payload: [String: AnyCodable]?

    enum CodingKeys: String, CodingKey {
        case action
        case payload
    }
}

/// Standard response structure to JavaScript
struct SafariResponse: Codable {
    let success: Bool
    let data: [String: AnyCodable]?
    let error: String?

    static func success(data: [String: Any]) -> SafariResponse {
        SafariResponse(
            success: true,
            data: data.mapValues { AnyCodable($0) },
            error: nil
        )
    }

    static func error(message: String) -> SafariResponse {
        SafariResponse(
            success: false,
            data: nil,
            error: message
        )
    }
}

/// Type-erased wrapper for Codable values
struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let string = try? container.decode(String.self) {
            value = string
        } else if let array = try? container.decode([AnyCodable].self) {
            value = array.map { $0.value }
        } else if let dictionary = try? container.decode([String: AnyCodable].self) {
            value = dictionary.mapValues { $0.value }
        } else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Unsupported type"
            )
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()

        switch value {
        case let bool as Bool:
            try container.encode(bool)
        case let int as Int:
            try container.encode(int)
        case let double as Double:
            try container.encode(double)
        case let string as String:
            try container.encode(string)
        case let array as [Any]:
            try container.encode(array.map { AnyCodable($0) })
        case let dictionary as [String: Any]:
            try container.encode(dictionary.mapValues { AnyCodable($0) })
        default:
            throw EncodingError.invalidValue(
                value,
                EncodingError.Context(
                    codingPath: container.codingPath,
                    debugDescription: "Unsupported type"
                )
            )
        }
    }
}
