import { z } from 'zod'

/**
 * Mensajes de validación en español.
 *
 * zod usa por defecto textos en inglés («Required», «Invalid input…»). Se instala un
 * mapa global para que ninguna pantalla pueda mostrar un mensaje en inglés, y además
 * cada esquema declara su propio mensaje donde aporta contexto de negocio.
 */
z.setErrorMap((issue, ctx) => {
  const invalidString = (): string => {
    const validation = (issue as { validation?: string }).validation
    switch (validation) {
      case 'email':
        return 'Correo electrónico no válido'
      case 'url':
        return 'Dirección web no válida'
      case 'uuid':
        return 'Identificador no válido'
      case 'regex':
        return 'El formato no es válido'
      case 'datetime':
        return 'Fecha y hora no válidas'
      default:
        return 'Valor no válido'
    }
  }

  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === 'undefined' || issue.received === 'null') {
        return { message: 'Este campo es obligatorio' }
      }
      if (issue.expected === 'number') return { message: 'Debe ser un número' }
      if (issue.expected === 'boolean') return { message: 'Debe ser verdadero o falso' }
      if (issue.expected === 'array') return { message: 'Debe seleccionar al menos una opción' }
      return { message: 'Tipo de dato no válido' }

    case z.ZodIssueCode.invalid_literal:
      return { message: 'Valor no permitido' }

    case z.ZodIssueCode.unrecognized_keys:
      return { message: 'Hay campos no reconocidos en el formulario' }

    case z.ZodIssueCode.invalid_union:
      return { message: 'La combinación de valores no es válida' }

    case z.ZodIssueCode.invalid_enum_value:
      return { message: 'Debe elegir una opción de la lista' }

    case z.ZodIssueCode.invalid_arguments:
    case z.ZodIssueCode.invalid_return_type:
      return { message: 'Error interno de validación' }

    case z.ZodIssueCode.invalid_date:
      return { message: 'La fecha no es válida' }

    case z.ZodIssueCode.invalid_string:
      return { message: invalidString() }

    case z.ZodIssueCode.too_small: {
      const minimum = (issue as { minimum?: number }).minimum
      const type = (issue as { type?: string }).type
      if (type === 'string') {
        if (minimum === 1) return { message: 'Este campo es obligatorio' }
        return { message: `Debe tener al menos ${minimum} caracteres` }
      }
      if (type === 'array') return { message: `Debe seleccionar al menos ${minimum} opción(es)` }
      return { message: `El valor debe ser mayor o igual a ${minimum}` }
    }

    case z.ZodIssueCode.too_big: {
      const maximum = (issue as { maximum?: number }).maximum
      const type = (issue as { type?: string }).type
      if (type === 'string') return { message: `No puede superar los ${maximum} caracteres` }
      if (type === 'array') return { message: `No puede seleccionar más de ${maximum} opción(es)` }
      return { message: `El valor debe ser menor o igual a ${maximum}` }
    }

    case z.ZodIssueCode.custom:
      return { message: ctx.defaultError === 'Required' ? 'Este campo es obligatorio' : ctx.defaultError }

    case z.ZodIssueCode.invalid_intersection_types:
      return { message: 'No se pudieron combinar los valores' }

    case z.ZodIssueCode.not_multiple_of:
      return { message: 'El valor no es un múltiplo válido' }

    case z.ZodIssueCode.not_finite:
      return { message: 'El número debe ser finito' }

    default:
      return { message: ctx.defaultError === 'Required' ? 'Este campo es obligatorio' : ctx.defaultError }
  }
})

export { z }
