import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#26201c",
          borderRadius: 16,
          color: "#f4eae3",
          fontSize: 30,
          fontWeight: 600,
          letterSpacing: -1,
        }}
      >
        IO
      </div>
    ),
    size,
  );
}
