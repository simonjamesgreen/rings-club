import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://uvvtdqltmdzbwchbtvbj.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2dnRkcWx0bWR6YndjaGJ0dmJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MTc1NDgsImV4cCI6MjA5MTk5MzU0OH0.qMHaphQXBRIZ2eZgyYFNEgRszRRM4V5jRSy3kPzLi5c'

export const supabase = createClient(supabaseUrl, supabaseKey)
