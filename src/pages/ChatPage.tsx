import { useParams } from 'react-router-dom';
import { ChatView } from '../components/chat/ChatView';
import { useDocTitle } from '../hooks/useMisc';

export default function ChatPage() {
  useDocTitle('Chat');
  const { id } = useParams();
  return <ChatView conversationId={id} />;
}
