import './styles/main.css';
import { handleDomMutations } from './features/mutationObserver';
import { initializeRowSelectionMutationObserver } from './features/bulkSelectionAndDragDrop';

const observerConfig = { attributes: true, childList: true, subtree: true };

const mutationObserver = new MutationObserver((mutations, observer) => {
    handleDomMutations(observer);
});

mutationObserver.observe(document.body, observerConfig);
initializeRowSelectionMutationObserver();
