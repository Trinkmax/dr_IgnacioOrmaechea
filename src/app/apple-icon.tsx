import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          color: "#f4eae3",
          fontSize: 76,
          fontWeight: 600,
          letterSpacing: -3,
        }}
      >
        <div
          style={{
            width: 136,
            height: 136,
            borderRadius: 999,
            border: "2px solid rgba(168,111,82,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          IO
        </div>
      </div>
    ),
    size,
  );
}
