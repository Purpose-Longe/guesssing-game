import { useGameSession } from './hooks/useGameSession';
import { JoinScreen } from './components/JoinScreen';
import { GameLobby } from './components/GameLobby';
import { GamePlay } from './components/GamePlay';

function App() {
  const {
    session,
    currentPlayer,
    players,
    attempts,
    timeRemaining,
    error,
    loading,
    handleCreateSession,
    handleJoinSession,
    handleStartGame,
    handleSubmitGuess,
    handleLeaveSession
  } = useGameSession();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-2xl p-8">
          <p className="text-lg font-semibold text-gray-800">Loading...</p>
        </div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Error</h2>
          <p className="text-gray-700 mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!session || !currentPlayer) {
    return (
      <JoinScreen
        onCreateSession={handleCreateSession}
        onJoinSession={handleJoinSession}
      />
    );
  }

  if (session.status === 'in_progress') {
    return (
      <GamePlay
        session={session}
        currentPlayer={currentPlayer}
        players={players}
        attempts={attempts}
        onSubmitGuess={handleSubmitGuess}
        timeRemaining={timeRemaining}
      />
    );
  }

  return (
    <GameLobby
      session={session}
      currentPlayer={currentPlayer}
      players={players}
      onStartGame={handleStartGame}
      onLeave={handleLeaveSession}
    />
  );
}

export default App;
