import type {Metadata} from "next";
import MobileExplorer from "@/components/rest-area-explorer";

export const metadata: Metadata = {title: "휴게소 지도"};

export default function MobilePage() {
  return <MobileExplorer />;
}
