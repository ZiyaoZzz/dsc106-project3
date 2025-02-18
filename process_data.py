import pandas as pd
import json
import gzip

def process_data():
    # Load all sheets
    file_path = 'Mouse_Data_Student_Copy.xlsx'
    fem_act = pd.read_excel(file_path, sheet_name='Fem Act')
    male_act = pd.read_excel(file_path, sheet_name='Male Act')
    fem_temp = pd.read_excel(file_path, sheet_name='Fem Temp')
    male_temp = pd.read_excel(file_path, sheet_name='Male Temp')

    data = {
        'Male Act': male_act,
        'Fem Act': fem_act,
        'Fem Temp': fem_temp,
        'Male Temp': male_temp
    }

    processed = []
    
    def process_sheet(df, gender, metric):
        df = df.reset_index().rename(columns={'index': 'Time'})
        df = df.melt(id_vars=['Time'], var_name='mouseId', value_name=metric)
        df['gender'] = gender
        df['time'] = pd.to_datetime('2023-01-01') + pd.to_timedelta(df['Time'], unit='m')
        df['minute'] = df['Time'] % 1440

        if gender == 'female':
            day = (df['Time'] // 1440).astype(int)
            df['estrus'] = (day - 2) % 4 == 0

        return df

    for sheet in data:
        gender = 'female' if sheet.startswith('Fem') else 'male'
        metric = 'activity' if 'Act' in sheet else 'temp'
        processed.append(process_sheet(data[sheet], gender, metric))

    final_df = pd.concat(processed)

    # Save as a compressed JSON file
    with gzip.open("processed_data.json.gz", "wt", encoding="utf-8") as f:
        json.dump(final_df.to_dict(orient="records"), f)

if __name__ == '__main__':
    process_data()
