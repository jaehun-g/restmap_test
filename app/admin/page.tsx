import type {Metadata} from "next";
import AdminExplorer from "@/components/admin-explorer";

export const metadata: Metadata = {title: "휴게소 조회 관리"};

export default function AdminPage() {
  return <AdminExplorer />;
}
