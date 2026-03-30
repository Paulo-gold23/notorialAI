import React from 'react';
import Modal from './Modal';

export default function AlertModal({ isOpen, onClose, title = 'Aviso', message }) {
    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <p className="mb-6 mt-0 text-sm">{message}</p>
            <div className="flex justify-end">
                <button
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg font-medium bg-[#3b82f6] text-white border-none cursor-pointer hover:bg-[#2563eb]"
                >
                    OK
                </button>
            </div>
        </Modal>
    );
}
