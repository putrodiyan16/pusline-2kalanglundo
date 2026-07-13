import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing environment variables')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface StudentData {
  fullName: string
  email: string
  className: string
}

interface CreateResult {
  status: 'success' | 'error'
  email: string
  message?: string
  tempPassword?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    // Verify auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: userError } = await supabase.auth.getUser(token)

    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Check if user is teacher
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('role', 'teacher')
      .maybeSingle()

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Only teachers can create students' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { students } = body as { students: StudentData[] }

    if (!Array.isArray(students) || students.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid students data' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const results: CreateResult[] = []

    for (const student of students) {
      try {
        const tempPassword = Math.random().toString(36).slice(-12)

        const { data: createData, error: createError } = await supabase.auth.admin.createUser({
          email: student.email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: {
            full_name: student.fullName,
            class_name: student.className,
          },
        })

        if (createError || !createData.user) {
          throw new Error(createError?.message || 'Failed to create user')
        }

        // Create profile
        await supabase.from('profiles').insert({
          id: createData.user.id,
          full_name: student.fullName,
          class_name: student.className,
        })

        // Set role
        await supabase.from('user_roles').insert({
          user_id: createData.user.id,
          role: 'student',
        })

        results.push({
          status: 'success',
          email: student.email,
          tempPassword,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        results.push({
          status: 'error',
          email: student.email,
          message,
        })
      }
    }

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
