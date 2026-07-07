import FlowEditorApp from "./FlowEditorApp";

export default async function EditFlowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FlowEditorApp id={id} />;
}
