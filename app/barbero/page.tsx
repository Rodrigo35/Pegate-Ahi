// LLAMAR SIGUIENTE DANDO PRIORIDAD A CLIENTES EN LOCAL (SIN PERDER AL QUE ESTÁ FUERA)
  const llamarSiguiente = async () => {
    if (colaEspera.length === 0) return;

    // 1. Verificar si hay un cliente físicamente en el local
    const clienteEnLocal = colaEspera.find((t) => t.modalidad_espera === 'local');

    // 2. Si hay alguien en el local, lo atendemos a él primero. Si no, tomamos al primero en la cola.
    const siguiente = clienteEnLocal || colaEspera[0];

    // 3. Pasar el cliente seleccionado a 'atendiendo'
    await supabase
      .from('turnos')
      .update({
        estado: 'atendiendo',
        llamado_en: new Date().toISOString(),
      })
      .eq('id', siguiente.id);

    // 4. Si el cliente que estaba en 1er lugar estaba fuera (diligencia) y atendimos a uno del local,
    // actualizamos la fecha de creación del turno presencial para mantener un orden limpio en la base de datos.
    if (clienteEnLocal && colaEspera[0].id !== clienteEnLocal.id) {
      // El cliente que estaba fuera (colaEspera[0]) automáticamente queda como #1 en la lista de espera (2º en la fila global)
      console.log(`Atendiendo a ${clienteEnLocal.nombre_cliente} (en local). ${colaEspera[0].nombre_cliente} permanece 2º en la cola.`);
    }

    if (siguiente.cliente_telefono && siguiente.modalidad_espera === 'diligencia') {
      enviarWhatsApp(siguiente.cliente_telefono, siguiente.nombre_cliente, siguiente.codigo_ticket);
    }

    fetchTurnos();
  };
