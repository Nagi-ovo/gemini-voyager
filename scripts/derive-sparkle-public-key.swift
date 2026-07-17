import CryptoKit
import Foundation

let input = FileHandle.standardInput.readDataToEndOfFile()
guard
  let encodedKey = String(data: input, encoding: .utf8)?.trimmingCharacters(
    in: .whitespacesAndNewlines
  ),
  let privateKey = Data(base64Encoded: encodedKey, options: .ignoreUnknownCharacters)
else {
  FileHandle.standardError.write(Data("Invalid Sparkle private key\n".utf8))
  exit(1)
}

let publicKey: Data
switch privateKey.count {
case 32:
  do {
    publicKey = try Curve25519.Signing.PrivateKey(rawRepresentation: privateKey)
      .publicKey.rawRepresentation
  } catch {
    FileHandle.standardError.write(Data("Invalid Sparkle private key\n".utf8))
    exit(1)
  }
case 96:
  publicKey = privateKey.suffix(32)
default:
  FileHandle.standardError.write(Data("Unsupported Sparkle private key format\n".utf8))
  exit(1)
}

print(publicKey.base64EncodedString())
