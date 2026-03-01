const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let users = {};

io.on('connection', (socket) => {
    console.log('Usuario conectado:', socket.id);

    socket.on('join-room', (name) => {
        let role = 'listener';
        // Si no hay host, el primero es host
        if (!Object.values(users).some(u => u.role === 'host')) {
            role = 'host';
        }
        users[socket.id] = { id: socket.id, name: name, role: role, mutedByHost: false };
        socket.emit('my-role', users[socket.id]);
        io.emit('update-user-list', users);
    });

    // Señalización P2P
    socket.on('offer', (data) => {
        socket.to(data.target).emit('offer', { sdp: data.sdp, caller: socket.id });
    });
    socket.on('answer', (data) => {
        socket.to(data.target).emit('answer', { sdp: data.sdp, caller: socket.id });
    });
    socket.on('ice-candidate', (data) => {
        socket.to(data.target).emit('ice-candidate', { candidate: data.candidate, caller: socket.id });
    });

    // Gestión de Roles
    socket.on('promote-user', (targetId) => {
        if (users[socket.id]?.role === 'host' && users[targetId]) {
            users[targetId].role = 'cohost';
            // Notificamos específicamente al usuario y a todos
            io.to(targetId).emit('role-changed', 'cohost');
            io.emit('update-user-list', users);
        }
    });

    socket.on('demote-user', (targetId) => {
        if (users[socket.id]?.role === 'host' && users[targetId]) {
            users[targetId].role = 'listener';
            users[targetId].mutedByHost = false;
            io.to(targetId).emit('role-changed', 'listener');
            io.emit('update-user-list', users);
        }
    });

    socket.on('mute-user', (targetId) => {
        if (users[socket.id]?.role === 'host' && users[targetId]) {
            users[targetId].mutedByHost = true;
            io.to(targetId).emit('force-mute');
            io.emit('update-user-list', users);
        }
    });

    socket.on('unmute-user', (targetId) => {
        if (users[socket.id]?.role === 'host' && users[targetId]) {
            users[targetId].mutedByHost = false;
            io.to(targetId).emit('force-unmute');
            io.emit('update-user-list', users);
        }
    });

    socket.on('disconnect', () => {
        const wasHost = users[socket.id]?.role === 'host';
        delete users[socket.id];
        if (wasHost) {
            const nextId = Object.keys(users)[0];
            if (nextId) {
                users[nextId].role = 'host';
                io.to(nextId).emit('my-role', users[nextId]);
            }
        }
        io.emit('update-user-list', users);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
